// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 117 P4 - the island pasture as built geometry, and the lightning's exit.
 *
 * Three things this phase changed that are easy to un-change by accident:
 *
 *   1. The fence grounds on the VISIBLE terrain surface, not on the raw bake.
 *      `TerrainBuilder._groundY` reads `meshSampleY` (the heightmap resampled
 *      onto the terrain mesh the player sees); `StructureBuilder` used to read
 *      `sample()` (the raw heightmap texels). On flat Home Field the two are
 *      identical and on Newsheepdogland's lowland homestead they differ by
 *      under 7cm, which is why a fence never exposed the gap. On the island
 *      pasture they differ by up to 48cm - a post sunk past its bottom rail.
 *
 *   2. No zap fires on Rolling Hills. D15 retires the lightning from gameplay
 *      but keeps `js/effects/CorralZapEffect.js` on disk one more cycle so the
 *      pasture can be reverted without a restore, so "it is gone" and "the file
 *      is gone" are two different assertions and only the first is wanted.
 *
 *   3. Rails span the SLOPED distance between their posts. A rail cut to the
 *      flat post spacing and then rotated onto a slope is short by the
 *      hypotenuse and leaves a hole at each end.
 *
 * Every assertion reads the real scene modules and the real bake. No scene stubs.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

import { StructureBuilder, resolveSceneEnclosure, resolvePenBox } from '../js/StructureBuilder.js';
import { Heightfield } from '../shared/terrain/Heightfield.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { field } from '../shared/scenes/field.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

/** The shipped bake, loaded the way the client loads it. */
function loadHeightfield(scene) {
    const binPath = resolve(process.cwd(), 'public', 'terrain', `${scene}.bin`);
    const manifest = JSON.parse(readFileSync(`${binPath}.json`, 'utf8'));
    const buf = readFileSync(binPath);
    return new Heightfield({
        data: new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)),
        width: manifest.width,
        height: manifest.height,
        worldSize: manifest.worldSize,
        peakHeight: manifest.peakHeight,
    });
}

// js/TerrainBuilder.js createTerrain(): desktop is 4000m across 384 segments.
const DESKTOP_MESH = { size: 4000, segments: 384 };

/**
 * A stand-in for the baked fence kit, so the instanced post/rail path runs
 * without loading a GLB. Same shape as the one in structure-builder.spec.js:
 * a post wrapper with its mesh authored 1m up, and a 1-unit rail.
 */
function installFenceKit(sb) {
    const wrap = (name, meshName, geometry, meshY = 0) => {
        const group = new THREE.Group();
        group.name = name;
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        mesh.name = meshName;
        mesh.position.y = meshY;
        group.add(mesh);
        return group;
    };
    sb.fencePresets.useGLBModels = true;
    sb.fencePresets.models.fencePost = wrap('Fence_Post', 'Mesh_Fence_Post_Runtime', new THREE.BoxGeometry(0.4, 2, 0.4), 1);
    sb.fencePresets.models.fenceRail = wrap('Fence_Rail', 'Mesh_Fence_Rail_Runtime', new THREE.BoxGeometry(1, 0.1, 0.12));
}

describe('the island pasture fence sits on the ground the player sees', () => {
    it('grounds on the terrain mesh, not on the raw heightmap texels', () => {
        const hf = loadHeightfield('rolling-hills');
        hf.bakeMeshGrid(DESKTOP_MESH);

        const sb = new StructureBuilder(new THREE.Scene());
        sb.setHeightfield(hf);

        // Walk the fence lines and confirm the builder reports the mesh height.
        const { minX, maxX, minZ, maxZ } = rollingHills.pen;
        let worstAgainstRaw = 0;
        for (let x = minX; x <= maxX; x += 1) {
            for (const z of [minZ, maxZ]) {
                expect(sb._groundY(x, z)).toBeCloseTo(hf.meshSampleY(x, z), 10);
                worstAgainstRaw = Math.max(worstAgainstRaw, Math.abs(sb._groundY(x, z) - hf.sample(x, z)));
            }
        }
        // And the two really do disagree here, so the assertion above is not
        // vacuous. If a future bake flattens this site the number drops and this
        // line is the one that says so out loud rather than silently passing.
        expect(worstAgainstRaw).toBeGreaterThan(0.1);
    });

    it('falls back to the raw sample when no mesh grid is bound', () => {
        // The diagnostics harnesses and the characterization specs hand this
        // builder a bare `{sample}` object; `meshSampleY` throws rather than
        // guessing, so the fallback is what keeps them working.
        const sb = new StructureBuilder(new THREE.Scene());
        sb.setHeightfield({ sample: (x, z) => 12 + x - z });
        expect(sb._groundY(10, 4)).toBe(18);
        sb.setHeightfield(null);
        expect(sb._groundY(10, 4)).toBe(0);
    });

    it('lands every post and rail on the terrain, with no piece left at y=0', () => {
        const hf = loadHeightfield('rolling-hills');
        hf.bakeMeshGrid(DESKTOP_MESH);
        const scene = new THREE.Scene();
        const sb = new StructureBuilder(scene);
        sb.fencePresets.useGLBModels = false;
        sb.setHeightfield(hf);
        const group = sb.buildPenEnclosure(resolveSceneEnclosure(rollingHills));
        group.updateMatrixWorld(true);

        // The ground under this pasture runs 24-29m, so anything still sitting
        // near y=0 is a piece that never got surfaced - buried 25m down.
        const world = new THREE.Vector3();
        let checked = 0;
        group.traverse((n) => {
            if (!n.isMesh) return;
            n.getWorldPosition(world);
            const ground = hf.meshSampleY(world.x, world.z);
            expect(ground).toBeGreaterThan(20);
            // Within one fence height of its own ground, above or below: posts
            // straddle it, rails ride 0.5-1.9m up, the gate leaf swings out.
            expect(Math.abs(world.y - ground), `${n.name || n.type} at (${world.x.toFixed(1)}, ${world.z.toFixed(1)})`)
                .toBeLessThan(4);
            checked++;
        });
        expect(checked).toBeGreaterThan(10);
    });

    it('scales each rail to the sloped span between its posts, not the flat spacing', () => {
        // The island pasture drops 1.57m across one 5m post spacing, which is a
        // 5.24m run. A rail cut to the flat 5m and then rotated onto the slope
        // is 24cm short - a hole at a fence the player walks right up to.
        //
        // Measured on a clean 45-degree ramp so the arithmetic is checkable by
        // hand: 5m across, 5m down, so the run is 5*sqrt(2).
        const scene = new THREE.Scene();
        const sb = new StructureBuilder(scene);
        installFenceKit(sb);
        sb.setHeightfield({ sample: (x) => x });

        const segment = sb.buildFenceSegment({ x: -5, z: 0 }, { x: 5, z: 0 });
        scene.add(segment);
        sb._surfaceToTerrain(segment);

        const rails = segment.getObjectByName('Fence_Rail_Instances');
        const spacing = segment.userData.fenceInstancingSpec.actualSpacing;
        expect(spacing).toBe(5);

        const m = new THREE.Matrix4();
        const scale = new THREE.Vector3();
        rails.getMatrixAt(0, m);
        m.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        expect(scale.x).toBeCloseTo(5 * Math.SQRT2, 6);
        // And it is genuinely longer than the flat spacing, so a regression to
        // `actualSpacing` cannot pass this by coincidence.
        expect(scale.x).toBeGreaterThan(spacing + 1);
    });
});

describe('no lightning on Rolling Hills, and the module survives it (D15)', () => {
    it('leaves no scene able to construct the zap pool', () => {
        // The pool was built in the `else` arm of the corral-effect branch, so
        // "no scene reaches it" is a claim about the scene data AND the branch.
        // Assert both: the branch is gone, and nothing declares a non-portal
        // corral that could have reached it.
        const src = read('js/boot/initWorld.js');
        expect(src).not.toContain("import('../effects/CorralZapEffect.js')");
        expect(src).not.toContain('CorralZapEffectPool');
        for (const scene of [field, rollingHills, openCountry, newsheepdogland]) {
            if (!scene.corral) continue;
            expect(scene.corral.effect, `${scene.id} corral effect`).toBe('portal');
        }
    });

    it('retires the flag pillar with the corral it marked', () => {
        // The 8m red flag was Rolling Hills' "find it from the far shore"
        // affordance for a destination with no geometry. The pasture has
        // geometry, and Open Country - the last corral - draws a portal.
        const src = read('js/StructureBuilder.js');
        expect(src).not.toContain('buildCorralStructure');
        expect(src).not.toContain('CorralMarker');
    });

    it('keeps js/effects/CorralZapEffect.js on disk', () => {
        // D15 keeps the module one cycle so the pasture can be reverted without
        // a restore. Deleting it is a cycle hard stop, not a cleanup.
        expect(existsSync(resolve(process.cwd(), 'js/effects/CorralZapEffect.js'))).toBe(true);
        expect(read('js/effects/CorralZapEffect.js')).toContain('export class CorralZapEffectPool');
    });

    it('still lets Open Country build its portal', () => {
        // The retirement visual that is NOT retired. The branch it lives in is
        // the one this phase edited, so prove the surviving arm still resolves.
        expect(openCountry.corral.effect).toBe('portal');
        const src = read('js/boot/initWorld.js');
        expect(src).toContain("import('../effects/PortalEffect.js')");
    });
});

describe('the visible gap and the passable gap are the same gap', () => {
    /**
     * Does any fence segment cover (x, z)? Segments are built at their midpoint
     * and rotated by `-atan2(dz, dx)`, so project onto the run.
     */
    function fenceCovers(group, x, z) {
        for (const seg of group.children) {
            const len = seg.userData.fenceInstancingSpec?.length;
            if (!len) continue;
            const angle = -seg.rotation.y;
            const dx = Math.cos(angle), dz = Math.sin(angle);
            const vx = x - seg.position.x, vz = z - seg.position.z;
            const along = vx * dx + vz * dz;
            const across = Math.abs(vx * dz - vz * dx);
            if (Math.abs(along) <= len / 2 && across < 0.5) return true;
        }
        return false;
    }

    it('gaps the edge the barrier gaps, on a rect where the two rules disagree', async () => {
        // Both shipping pens are square, and on a square the nearest-face rule
        // and the Cycle 66 raw-offset rule it replaced agree - so nothing in
        // the real scenes can tell them apart. This is the case that can: a
        // 100x10 rect with the gate on a LONG edge but well off centre. The
        // raw-offset rule compares |dx|=30 against |dz|=5 and picks the short
        // (vertical) edge, which fences straight across the opening and leaves
        // a hole in a wall 30 metres away. PenBarrier already got this right;
        // this is the assertion that keeps the fence agreeing with it.
        const { PenBarrier } = await import('../shared/PenBarrier.js');
        const pen = { minX: -50, maxX: 50, minZ: -5, maxZ: 5 };
        const gate = { x: 30, z: 5, width: 8 };

        const scene = new THREE.Scene();
        const sb = new StructureBuilder(scene);
        installFenceKit(sb);
        const group = sb.buildPenEnclosure({ pen, gate });
        const barrier = new PenBarrier(pen, gate);

        expect(barrier.onVertical).toBe(false);
        for (let t = -0.8; t <= 0.8; t += 0.2) {
            const x = gate.x + t * (gate.width / 2);
            expect(barrier._inGateGap(x, gate.z, 0.6, true), `barrier gaps x=${x}`).toBe(true);
            expect(fenceCovers(group, x, gate.z), `fence covers x=${x}`).toBe(false);
        }
        // The rest of that edge is still fenced, so this is a gap and not a
        // missing wall.
        expect(fenceCovers(group, -40, gate.z)).toBe(true);
        expect(fenceCovers(group, 48, gate.z)).toBe(true);
    });
});

describe('the enclosure resolver, on the real scenes', () => {
    it('reads Rolling Hills\' nested gate and Newsheepdogland\'s top-level one', () => {
        const rh = resolveSceneEnclosure(rollingHills);
        expect(rh.gate).toEqual({
            x: rollingHills.pen.gate.position.x,
            z: rollingHills.pen.gate.position.z,
            width: rollingHills.pen.gate.width,
            facingDeg: rollingHills.pen.gate.facingDeg,
        });

        const nsl = resolveSceneEnclosure(newsheepdogland);
        expect(nsl.gate.x).toBe(newsheepdogland.gate.position.x);
        expect(nsl.gate.z).toBe(newsheepdogland.gate.position.z);
        // A nested-only resolver would drop this one, and the homestead's fence
        // would quietly stop being built.
        expect(newsheepdogland.pen.gate).toBeUndefined();
    });

    it('returns null for every scene without a pen, so nothing else changes shape', () => {
        expect(resolveSceneEnclosure(field)).toBeNull();
        expect(resolveSceneEnclosure(openCountry)).toBeNull();
        expect(resolveSceneEnclosure(null)).toBeNull();
        expect(resolveSceneEnclosure({})).toBeNull();
        // A pen with no gate anywhere is not an enclosure this can build.
        expect(resolveSceneEnclosure({ pen: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 } })).toBeNull();
    });

    it('resolves both pen forms to the same box the barrier uses', async () => {
        // resolvePenBox is a deliberate duplicate of PenBarrier's constructor
        // (the barrier is dynamically imported to stay out of the eager chunk).
        // This is the pin that stops the copy drifting.
        const { PenBarrier } = await import('../shared/PenBarrier.js');
        for (const scene of [rollingHills, newsheepdogland]) {
            const enclosure = resolveSceneEnclosure(scene);
            const box = resolvePenBox(enclosure.pen);
            const barrier = new PenBarrier(enclosure.pen, enclosure.gate);
            expect(box, scene.id).toEqual({
                minX: barrier.minX, maxX: barrier.maxX, minZ: barrier.minZ, maxZ: barrier.maxZ,
            });
        }
    });
});

describe('Newsheepdogland\'s homestead enclosure is unchanged', () => {
    it('builds the same ring it built when the builder only knew squares', () => {
        // The rect branch is new code on a path Newsheepdogland has shipped on
        // since Cycle 65. Rebuild its enclosure and check the segments against
        // the four edges its `{center, radius}` pen spells out.
        const scene = new THREE.Scene();
        const sb = new StructureBuilder(scene);
        sb.fencePresets.useGLBModels = false;
        const enclosure = resolveSceneEnclosure(newsheepdogland);
        const group = sb.buildPenEnclosure(enclosure);

        const { x: cx, z: cz } = newsheepdogland.pen.center;
        const R = newsheepdogland.pen.radius;
        const assembly = group.getObjectByName('PenGateAssembly');
        expect(assembly.position.x).toBe(newsheepdogland.gate.position.x);
        expect(assembly.position.z).toBe(newsheepdogland.gate.position.z);
        expect(assembly.rotation.y).toBeCloseTo((newsheepdogland.gate.facingDeg * Math.PI) / 180, 10);

        // Gate at (610, -1000), pen centred (640, -1000): the gate is on the
        // WEST edge, so that edge is the one split into flanks.
        const segments = group.children.filter((c) => c !== assembly);
        expect(segments.length).toBe(5);
        const at = (x, z) => segments.some((s) =>
            Math.abs(s.position.x - x) < 1e-6 && Math.abs(s.position.z - z) < 1e-6);
        expect(at(cx, cz + R)).toBe(true);   // north edge, midpoint
        expect(at(cx, cz - R)).toBe(true);   // south edge, midpoint
        expect(at(cx + R, cz)).toBe(true);   // far (east) edge, midpoint
    });
});
