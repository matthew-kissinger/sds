// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The worn approach to the pen gate reaches the ground it is supposed to wear.
 *
 * Cycle 115 Phase 4 puts one shape - a tapered band running out of the gate
 * mouth into the field - into three places at once: the WebGL terrain fragment
 * shader, the WebGPU terrain node material, and the CPU grass scatter. The
 * failure mode this file exists for is the same one Cycle 114 Phase 5 shipped
 * and had to be caught by eye: a term that is present in the shader and dead at
 * runtime because nothing ever writes the uniform that drives it.
 *
 * The second failure mode is divergence. `js/GrassSystem.js` carries two
 * deliberately RNG-order-identical scatter mirrors (`createChunk` and
 * `_gatherChunkClumps`); a keep term added to one and not the other silently
 * desynchronises the consolidated WebGPU grass field from the per-chunk WebGL
 * one, and nothing about that failure looks like a failure until someone
 * compares two screenshots.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { DoubleSide, MeshLambertNodeMaterial, TSL } from 'three/webgpu';

import {
    GROUND_APPROACH,
    GROUND_APPROACH_GLSL,
    groundApproachGrassKeep,
    groundApproachWear,
    resolveGateApproach,
} from '../js/world/groundShading.js';
import { GrassSystem } from '../js/GrassSystem.js';
import { mulberry32 } from '../shared/Random.js';
import { TerrainBuilder } from '../js/TerrainBuilder.js';
import { createWebGpuTerrainNodeMaterialFactories } from '../js/world/webgpuTerrainNodeMaterialFactories.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// Home Field's own numbers, so the assertions below read as "the gate the
// player actually walks to" rather than as arbitrary coordinates.
const HOME_FIELD_APPROACH = resolveGateApproach(field);

/**
 * The minimum GrassSystem surface `_rollGroundKeep` touches, so the scatter
 * rules can be exercised without a GL context. Home Field's real pen rect by
 * default, since that is the zone the approach actually overlaps.
 */
function makeScatterHost({ approach, zones, random } = {}) {
    return {
        exclusionZones: zones ?? [{ type: 'rect', minX: -30, maxX: 30, minZ: 102, maxZ: 130 }],
        gateApproach: approach ?? null,
        random: random ?? (() => 0),
        _exclusionZoneDistance: GrassSystem.prototype._exclusionZoneDistance,
        exclusionKeepProbability: GrassSystem.prototype.exclusionKeepProbability,
    };
}

describe('resolveGateApproach derives the approach from the scene the game ships', () => {
    it('puts Home Field\'s approach at the pen gate, pointing into the play area', () => {
        expect(HOME_FIELD_APPROACH).toEqual({
            mouth: { x: 0, z: 100 },
            axis: { x: 0, z: -1 },
            gateWidth: 8,
        });
        // The axis points AWAY from the pen. Getting the sign wrong would lay
        // the approach across the pasture the sheep are penned in, which is
        // the one place no player ever walks.
        const penZ = field.pasture.centerZ;
        expect(field.gate.position.z).toBeLessThan(penZ);
        expect(HOME_FIELD_APPROACH.axis.z).toBeLessThan(0);
    });

    it('returns null for every scene without a pen gate, so their ground is untouched', () => {
        // Rolling Hills and Open Country have no gate at all. Newsheepdogland
        // has a gate but no pasture rect, so there is no inside to point away
        // from; its homestead approach is its own geometry problem.
        expect(resolveGateApproach(rollingHills)).toBeNull();
        expect(resolveGateApproach(openCountry)).toBeNull();
        expect(resolveGateApproach(newsheepdogland)).toBeNull();
        expect(resolveGateApproach(null)).toBeNull();
        expect(resolveGateApproach({})).toBeNull();
    });

    it('refuses a gate with no usable width rather than emitting one', () => {
        // Every extent is a multiple of the gate width. A zero or missing width
        // makes the whole shape degenerate, and a NaN axis in a terrain shader
        // renders as a black planet.
        expect(resolveGateApproach({ ...field, gate: { position: { x: 0, z: 100 } } })).toBeNull();
        expect(resolveGateApproach({ ...field, gate: { position: { x: 0, z: 100 }, width: 0 } })).toBeNull();
        // A gate sitting exactly on the pen's centre has no outward direction.
        expect(resolveGateApproach({
            ...field,
            gate: { position: { x: 0, z: field.pasture.centerZ }, width: 8 },
        })).toBeNull();
    });
});

describe('the approach is shaped like traffic, not like a painted rectangle', () => {
    const wear = (x, z) => groundApproachWear(x, z, HOME_FIELD_APPROACH);

    it('is at full wear on the threshold', () => {
        expect(wear(0, 100)).toBeCloseTo(1, 6);
    });

    it('reaches back through the gate line so the dirt does not stop at the fence', () => {
        // backReach is 0.45 x 8m = 3.6m: full wear at the gate line itself,
        // fading out over the first few metres inside the pen. A hard stop
        // exactly on the fence line is the thing this reach exists to avoid.
        expect(wear(0, 101)).toBeGreaterThan(0.5);
        expect(wear(0, 102)).toBeGreaterThan(0);
        expect(wear(0, 102)).toBeLessThan(1);
        // ...and it stops shortly after that, rather than flooding the pasture
        // the sheep are penned in.
        expect(wear(0, 105)).toBe(0);
        expect(wear(0, 110)).toBe(0);
    });

    it('fades to nothing by the far end instead of running to the fence', () => {
        // reach is 2.8 x 8m = 22.4m out from the mouth.
        expect(wear(0, 90)).toBeGreaterThan(0.5);
        expect(wear(0, 84)).toBeGreaterThan(0);
        expect(wear(0, 84)).toBeLessThan(0.5);
        expect(wear(0, 76)).toBe(0);
        // The rest of the pasture never hears about it.
        expect(wear(0, 0)).toBe(0);
        expect(wear(-60, -60)).toBe(0);
    });

    it('decreases monotonically along the axis, so it reads as an approach', () => {
        let previous = Infinity;
        for (let z = 100; z >= 74; z -= 2) {
            const current = wear(0, z);
            expect(current).toBeLessThanOrEqual(previous + 1e-9);
            previous = current;
        }
    });

    it('is symmetric across the axis and fans outward along it', () => {
        expect(wear(4, 96)).toBeCloseTo(wear(-4, 96), 9);
        // Narrow at the mouth (0.7 x 8m = 5.6m half-width), wider at the far
        // end (1.5 x 8m = 12m). A point 9m off-centre is outside the band at
        // the threshold and inside it further out.
        expect(wear(9, 99)).toBe(0);
        expect(wear(9, 88)).toBeGreaterThan(0);
    });

    it('feathers its edge rather than cutting it', () => {
        // Walking sideways across the band at a fixed distance out must pass
        // through intermediate values, not step from 1 to 0.
        const samples = [];
        for (let x = 0; x <= 14; x += 0.5) samples.push(wear(x, 92));
        const partial = samples.filter((v) => v > 0.02 && v < 0.98);
        expect(partial.length).toBeGreaterThan(3);
    });
});

describe('grass thins over the approach rather than stopping at an edge', () => {
    it('keeps a fraction of the clumps at full wear instead of going bald', () => {
        const keep = groundApproachGrassKeep(0, 100, HOME_FIELD_APPROACH);
        expect(keep).toBeCloseTo(GROUND_APPROACH.grassKeepMin, 6);
        // The acceptance line is that the grass THINS. Zero is a bald strip,
        // which is only a differently-shaped knife edge.
        expect(keep).toBeGreaterThan(0);
    });

    it('leaves ground off the approach completely alone', () => {
        expect(groundApproachGrassKeep(0, 0, HOME_FIELD_APPROACH)).toBe(1);
        expect(groundApproachGrassKeep(40, 95, HOME_FIELD_APPROACH)).toBe(1);
        expect(groundApproachGrassKeep(0, 100, null)).toBe(1);
    });

    it('composes with the exclusion bands by minimum, through one entry point', () => {
        // Call the real method against a bare host: the composition rule is what
        // matters, not the 2,700-line system it lives on. `random` is stubbed to
        // 0 so the exclusion band never rejects and the returned keep is
        // observable; the draw itself is asserted separately below.
        const host = makeScatterHost({ approach: HOME_FIELD_APPROACH, random: () => 0 });
        const rollAt = (x, z) => GrassSystem.prototype._rollGroundKeep.call(host, x, z);

        // Somewhere on the gate line where both terms bite AND the position
        // hash lets the clump through, so there is a keep value to read. The
        // result must be the smaller of the two rather than their product,
        // which would drive the overlap to near-zero and re-open the bald patch
        // Cycle 114 Phase 1 closed.
        let checked = 0;
        for (let x = -6; x <= 6; x += 0.25) {
            const kept = rollAt(x, 100);
            if (kept <= 0) continue;
            const exclusionOnly = GrassSystem.prototype.exclusionKeepProbability.call(host, x, 100);
            const approachOnly = groundApproachGrassKeep(x, 100, HOME_FIELD_APPROACH);
            expect(exclusionOnly).toBeLessThan(1);
            expect(approachOnly).toBeLessThan(1);
            expect(kept).toBeCloseTo(Math.min(exclusionOnly, approachOnly), 9);
            checked++;
        }
        expect(checked).toBeGreaterThan(0);
        // Well clear of both.
        expect(rollAt(0, 0)).toBe(1);
    });

    it('is inert on a scene with no gate approach', () => {
        const host = makeScatterHost({ approach: null, zones: [], random: () => 0 });
        expect(GrassSystem.prototype._rollGroundKeep.call(host, 0, 100)).toBe(1);
    });

    it('rejects roughly the intended fraction on the approach, and none off it', () => {
        // The whole point of a keep PROBABILITY is that it thins rather than
        // clears. Walk a line of candidate positions down the approach centre
        // and count survivors.
        const host = makeScatterHost({ approach: HOME_FIELD_APPROACH, zones: [], random: () => 0 });
        let onApproach = 0, onApproachKept = 0;
        for (let i = 0; i < 400; i++) {
            const x = -2 + (i % 20) * 0.2;
            const z = 99 - Math.floor(i / 20) * 0.4;
            onApproach++;
            if (GrassSystem.prototype._rollGroundKeep.call(host, x, z) > 0) onApproachKept++;
        }
        const survival = onApproachKept / onApproach;
        expect(survival).toBeGreaterThan(0.05);
        expect(survival).toBeLessThan(0.5);

        let offApproachKept = 0;
        for (let i = 0; i < 200; i++) {
            const kept = GrassSystem.prototype._rollGroundKeep.call(host, -40 + i * 0.3, 20);
            if (kept > 0) offApproachKept++;
        }
        expect(offApproachKept).toBe(200);
    });

    it('never draws from the shared scatter stream for the approach', () => {
        // An extra draw off the shared PRNG shifts every clump scattered after
        // it, which re-scatters the whole field rather than the ground in front
        // of the gate. Cycle 114's exclusion draw must still happen; the
        // approach's must not.
        const draws = [];
        const host = makeScatterHost({
            approach: HOME_FIELD_APPROACH,
            zones: [],
            random: () => { draws.push(1); return 0; },
        });
        // Deep on the approach, clear of every exclusion zone: keep < 1, so a
        // naive implementation would draw here.
        GrassSystem.prototype._rollGroundKeep.call(host, 0, 96);
        expect(draws).toHaveLength(0);

        // ...while a point inside an exclusion falloff band still draws exactly
        // once, exactly as it did before this phase.
        const banded = makeScatterHost({
            approach: HOME_FIELD_APPROACH,
            random: () => { draws.push(1); return 0; },
        });
        GrassSystem.prototype._rollGroundKeep.call(banded, 0, 100);
        expect(draws).toHaveLength(1);
    });

    it('setGateApproach normalises undefined to null', () => {
        const host = { gateApproach: HOME_FIELD_APPROACH };
        GrassSystem.prototype.setGateApproach.call(host, undefined);
        expect(host.gateApproach).toBeNull();
    });
});

describe('both scatter mirrors consume the identical keep term', () => {
    // js/GrassSystem.js says it above _gatherChunkClumps: the two loops exist
    // to produce byte-identical layouts, and they only do that while they draw
    // the same randoms in the same order. This is the guard for that claim.
    const src = read('js/GrassSystem.js');

    it('calls the one combined keep function from exactly two places', () => {
        expect(src.match(/this\._rollGroundKeep\(x, z\)/g)).toHaveLength(2);
    });

    it('tests the result the same way in both', () => {
        expect(src.match(/if \(groundKeep <= 0\) continue;/g)).toHaveLength(2);
    });

    it('leaves no extra reject drawing off the shared stream in either', () => {
        // Five literal draws each: x, z, the density roll, then yaw and scale
        // for the survivors. Everything else routes through _rollGroundKeep,
        // which draws for the exclusion band and hashes for the approach. A
        // sixth draw in one loop and not the other is the exact shape of the
        // divergence this guard is for.
        const gather = src.slice(
            src.indexOf('_gatherChunkClumps(minX'),
            src.indexOf('transforms.push(yaw, scale, heightMul);')
        );
        const chunk = src.slice(
            src.indexOf('createChunk(cx, cz'),
            src.indexOf('instancedMesh.instanceMatrix.needsUpdate = true;')
        );
        expect(gather.match(/this\.random\(\)/g)).toHaveLength(5);
        expect(chunk.match(/this\.random\(\)/g)).toHaveLength(5);
    });

    it('feeds the same combined keep into the same height taper, in both', () => {
        expect(src.match(/_exclusionHeightMul\(pos\.groundKeep\)/g)).toHaveLength(2);
    });
});

describe('the scatter delta a golden re-baseline should expect', () => {
    // The approach thins grass by rejecting clumps, and the candidate loop
    // breaks early once it has enough survivors, so rejecting more makes it
    // run further and draw more positions. That knock-on is inherent to Cycle
    // 114's scatter, but it is the difference between "the ground in front of
    // the gate changed" and "the field reshuffled", and whoever re-baselines
    // the goldens deserves the number rather than a surprise.
    function gatherHost(approach) {
        return {
            random: mulberry32(12345),
            _isCoastline: false,
            boundary: null,
            heightfield: null,
            config: { grassRadius: 250, worldSize: 420 },
            exclusionZones: [{ type: 'rect', minX: -30, maxX: 30, minZ: 102, maxZ: 130 }],
            gateApproach: approach,
            isExcluded: GrassSystem.prototype.isExcluded,
            _exclusionZoneDistance: GrassSystem.prototype._exclusionZoneDistance,
            exclusionKeepProbability: GrassSystem.prototype.exclusionKeepProbability,
            _rollGroundKeep: GrassSystem.prototype._rollGroundKeep,
            _tallHeightMul: GrassSystem.prototype._tallHeightMul,
            _exclusionHeightMul: GrassSystem.prototype._exclusionHeightMul,
        };
    }
    function gather(approach) {
        const host = gatherHost(approach);
        const offsets = [], transforms = [];
        // A chunk straddling the gate approach, from the same seed both ways.
        GrassSystem.prototype._gatherChunkClumps.call(host, -20, 80, 20, 100, 300, offsets, transforms);
        return { offsets, transforms };
    }

    const withoutApproach = gather(null);
    const withApproach = gather(HOME_FIELD_APPROACH);
    const positions = ({ offsets }) => {
        const out = new Set();
        for (let i = 0; i < offsets.length; i += 3) out.add(`${offsets[i]},${offsets[i + 2]}`);
        return out;
    };

    it('thins the chunk over the approach rather than clearing or ignoring it', () => {
        const before = withoutApproach.offsets.length / 3;
        const after = withApproach.offsets.length / 3;
        expect(after).toBeLessThan(before);
        expect(after).toBeGreaterThan(before * 0.5);
    });

    it('keeps the overwhelming majority of the chunk exactly where it was', () => {
        // The reject is a position hash, so surviving clumps keep their
        // positions; only the loop running further introduces new ones.
        const before = positions(withoutApproach);
        const after = [...positions(withApproach)];
        const shared = after.filter((k) => before.has(k)).length;
        expect(shared / after.length).toBeGreaterThan(0.9);
    });

    it('shortens the blades it keeps on the approach', () => {
        // transforms is [yaw, scale, heightMul] per clump. Somewhere in the
        // worn band the height taper has to bite, or the thinning reads as
        // instances gone missing rather than as ground worn down.
        const tapered = [];
        for (let i = 2; i < withApproach.transforms.length; i += 3) {
            if (withApproach.transforms[i] < 1) tapered.push(withApproach.transforms[i]);
        }
        expect(tapered.length).toBeGreaterThan(0);
        expect(Math.min(...tapered)).toBeLessThan(0.8);
    });
});

describe('the approach is wired into both terrain paths', () => {
    it('generates its GLSL from the constants, so the two paths cannot drift', () => {
        for (const key of ['reach', 'backReach', 'mouthHalfWidth', 'farHalfWidth', 'feather', 'dirtBlend']) {
            expect(GROUND_APPROACH_GLSL).toContain(String(GROUND_APPROACH[key]));
        }
    });

    it('drives the WebGL terrain uniforms from the scene gate', () => {
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene, false, field);
        const terrain = builder.createTerrain();
        try {
            const u = terrain.material.uniforms;
            expect(terrain.material.fragmentShader).toContain('sdsGroundApproachDirt(');
            expect(u.uApproachStrength.value).toBe(1);
            expect(u.uApproachWidth.value).toBe(8);
            expect(u.uApproachMouth.value.x).toBe(0);
            expect(u.uApproachMouth.value.y).toBe(100);
            expect(u.uApproachAxis.value.x).toBe(0);
            expect(u.uApproachAxis.value.y).toBe(-1);
        } finally {
            terrain.geometry?.dispose?.();
            terrain.material?.dispose?.();
            scene.remove(terrain);
        }
    });

    it('holds the WebGL strength at zero on a scene with no gate', () => {
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene, false, rollingHills);
        const terrain = builder.createTerrain();
        try {
            expect(terrain.material.uniforms.uApproachStrength.value).toBe(0);
            // Never zero, even unused: the shader clamps it, but a zero width
            // is one edit away from dividing by it.
            expect(terrain.material.uniforms.uApproachWidth.value).toBeGreaterThan(0);
        } finally {
            terrain.geometry?.dispose?.();
            terrain.material?.dispose?.();
            scene.remove(terrain);
        }
    });

    it('drives the WebGPU node uniforms from the same resolved geometry', () => {
        const nodeFactories = createWebGpuTerrainNodeMaterialFactories(
            { ...THREE, MeshLambertNodeMaterial, DoubleSide, TSL }
        );
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene, false, field, {
            search: '?renderer=webgpu&webgpuTerrain=1',
            webgpuTerrainFactories: nodeFactories,
        });
        const terrain = builder.createTerrain();
        try {
            const n = terrain.material.userData.gateApproachNodeUniforms;
            expect(n.strength.value).toBe(1);
            expect(n.width.value).toBe(8);
            expect(n.mouth.value.x).toBe(0);
            expect(n.mouth.value.y).toBe(100);
            expect(n.axis.value.y).toBe(-1);
            // The colour graph built with the approach folded in. This is the
            // half that catches a TSL API mistake, which throws at build time.
            expect(terrain.material.colorNode).toBeTruthy();
        } finally {
            terrain.geometry?.dispose?.();
            terrain.material?.userData?.heightTexture?.dispose?.();
            terrain.material?.dispose?.();
            scene.remove(terrain);
        }
    });

    it('holds the WebGPU strength at zero on a scene with no gate', () => {
        const nodeFactories = createWebGpuTerrainNodeMaterialFactories(
            { ...THREE, MeshLambertNodeMaterial, DoubleSide, TSL }
        );
        const scene = new THREE.Scene();
        const builder = new TerrainBuilder(scene, false, rollingHills, {
            search: '?renderer=webgpu&webgpuTerrain=1',
            webgpuTerrainFactories: nodeFactories,
        });
        const terrain = builder.createTerrain();
        try {
            const n = terrain.material.userData.gateApproachNodeUniforms;
            expect(n.strength.value).toBe(0);
            expect(n.width.value).toBeGreaterThan(0);
        } finally {
            terrain.geometry?.dispose?.();
            terrain.material?.userData?.heightTexture?.dispose?.();
            terrain.material?.dispose?.();
            scene.remove(terrain);
        }
    });

    it('hands the same resolved approach to the grass scatter', () => {
        // TerrainBuilder resolves it once and both consumers read that one
        // answer. Deriving it twice is how the shaded ground and the scattered
        // grass end up describing different approaches.
        const src = read('js/TerrainBuilder.js');
        expect(src).toContain('this.gateApproach = resolveGateApproach(sceneDef)');
        expect(src).toMatch(/setGateApproach\(this\.gateApproach\)[\s\S]{0,400}grassSystem\.init\(\)/);
        expect(src).toContain('approach: this.gateApproach');
    });
});
