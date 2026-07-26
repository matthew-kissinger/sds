// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The ground threshold arc, on all four scenes (Cycle 116 Phase 3-B).
 *
 * Four failure modes this file exists for.
 *
 * ONE: the arc ships on some scenes and not others. This is the specific mistake
 * the corrected cycle plan caught by reading `js/StructureBuilder.js`: it returns
 * early from its gate path whenever the scene declares a `corral`, so Open
 * Country builds no gate group at all and an arc parented to that group would
 * simply be absent there. (Rolling Hills was the second such scene until Cycle
 * 117 P4 gave the island a fenced pasture; it now builds a gate group of its own,
 * which is the opposite premise and the same rule. The test below reads which is
 * which off the real builder instead of taking this paragraph's word for it.)
 * D14 says the language the player learns on Home Field transfers, so the
 * four-scene sweep below is the phase's whole point, and the structural guard
 * fails if the arc is ever imported into the fence or structure builders.
 *
 * TWO: a flat disc on a hill. Rolling Hills and Open Country are heightfield
 * islands, and a ring at one sampled Y buries its uphill half and floats its
 * downhill half. The conformance tests hand the builder a sloped `groundY` and
 * check every vertex against that same function, so a build that samples once
 * fails rather than merely looking wrong in a screenshot nobody takes.
 *
 * THREE: reading the raw heightfield instead of `TerrainBuilder._groundY`. Only
 * `_groundY` applies the smoothstep-to-zero over the last 20m of `worldSize`
 * that the visible terrain mesh uses, and Newsheepdogland's gate is far enough
 * out for the difference to be the arc hanging over the flat skirt. The fake
 * game carries a heightfield that deliberately disagrees with its terrain.
 *
 * FOUR: a near state that stacks with the far state, or that composes the
 * distance fade and the occupancy curve its own way. The arc reads its opacity
 * through `gateThresholdOpacity`, the one composition `js/world/gateThreshold.js`
 * states, and the handover tests drive a real cue across the whole band and
 * assert the column and the arc are never both drawing.
 *
 * Nothing below hand-writes a radius, a position or an angle. Every expected
 * value is read out of the real descriptor or the real threshold module, because
 * a spec that restates the number the code typed certifies whatever the code
 * did.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

import {
    resolveGateDescriptor,
    GATE_CUE_NEAR_DISTANCE,
    GATE_CUE_COLUMN_FADE_SPAN,
    GATE_CUE_WARM_LINEAR,
    GATE_RIM_MATERIALS_KEY,
    GATE_POST_RIM_PEAK_INTENSITY,
    GATE_THRESHOLD_BASE_OPACITY,
    gateThresholdRadius,
    gateThresholdOpacity,
    gateThresholdBrightness,
    gateRimFactor,
} from '../js/world/gateCue.js';
import {
    createGateThresholdArc,
    buildGateArcGeometry,
    gateArcSweep,
    GATE_ARC_GROUND_LIFT_M,
} from '../js/effects/GateThresholdArc.js';
import { bindGateCue, createGateCue, GATE_COLUMN_OPACITY } from '../js/effects/GateColumn.js';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { newsheepdogland } from '../shared/scenes/newsheepdogland.js';

const REPO = resolve(import.meta.dirname, '..');
const source = (relative) => readFileSync(resolve(REPO, relative), 'utf8');

const ARC_NAME = 'gate-cue-threshold-arc';

/**
 * The five destinations this cycle has to draw at. Open Country appears twice
 * because its objective moves the destination mid-round, and the arc has to
 * follow it; that is a live-state read, so it is expressed as a game state
 * rather than as a second scene.
 */
const DESTINATIONS = [
    ['Home Field gate', field, null],
    ['Rolling Hills pasture gate', rollingHills, null],
    ['Open Country round-up zone', openCountry, { objective: { stage: 'roundup' } }],
    ['Open Country portal', openCountry, { objective: { stage: 'drive' } }],
    ['Newsheepdogland pen gate', newsheepdogland, null],
];

/** Read a built geometry back as world-space vertices. */
function verticesOf(geometry) {
    const p = geometry.getAttribute('position');
    const out = [];
    for (let i = 0; i < p.count; i++) out.push({ x: p.getX(i), y: p.getY(i), z: p.getZ(i) });
    return out;
}

/** Every vertex's horizontal distance from a point. */
const radiiFrom = (vertices, centre) =>
    vertices.map((v) => Math.hypot(v.x - centre.x, v.z - centre.z));

/** A sloped, non-degenerate ground. Nothing about it is axis-aligned or flat. */
const slopedGround = (x, z) => Math.sin(x * 0.037) * 4.5 + Math.cos(z * 0.021) * 3.1 + z * 0.015;

/** Minimal SheepDogSimulation shape: exactly what bindGateCue reads. */
function fakeGame(sceneDef, { groundY = () => 0, dog = null, gates = [] } = {}) {
    const scene = new THREE.Scene();
    return {
        currentScene: sceneDef,
        gameState: null,
        sheepdog: dog ? { position: dog } : null,
        sceneManager: { getScene: () => scene },
        terrainBuilder: { _groundY: vi.fn(groundY) },
        structureBuilder: { structures: { gates, fences: [], decorations: [] } },
        // The trap: a heightfield that disagrees with the terrain the player
        // sees. Anything reading it instead of _groundY floats over the skirt.
        heightfield: { sample: (x, z) => groundY(x, z) + 40 },
        scene,
    };
}

const arcsIn = (scene) => scene.children.filter((c) => c.name === ARC_NAME);

/** A cue with no game attached, for driving `update` against a scripted dog. */
function scriptedCue(sceneDef, gameState, dogRef, extra = {}) {
    const scene = new THREE.Scene();
    const descriptor = resolveGateDescriptor(sceneDef, gameState);
    const cue = createGateCue({
        scene,
        descriptor,
        groundY: () => 0,
        getDogPosition: () => dogRef.position,
        ...extra,
    });
    return { cue, scene, descriptor };
}

const dogAt = (descriptor, distance) => ({
    x: descriptor.position.x + distance,
    z: descriptor.position.z,
});

describe('the arc draws at the destination of all four scenes', () => {
    it.each(DESTINATIONS)('%s gets exactly one arc, centred on its destination', (_label, sceneDef, gameState) => {
        const game = fakeGame(sceneDef, { groundY: slopedGround });
        game.gameState = gameState;
        const cue = bindGateCue(game);
        expect(cue).not.toBeNull();

        const arcs = arcsIn(game.scene);
        expect(arcs.length).toBe(1);

        // Centre and radius are read back out of the vertices rather than off
        // the mesh transform, because the strip carries its own world-space
        // coordinates and a transform would be a second, driftable answer.
        const descriptor = resolveGateDescriptor(sceneDef, gameState);
        const radii = radiiFrom(verticesOf(arcs[0].geometry), descriptor.position);
        const mid = (Math.min(...radii) + Math.max(...radii)) / 2;
        expect(mid).toBeCloseTo(gateThresholdRadius(descriptor), 2);
    });

    it('draws whether or not the structure builder builds a gate group', async () => {
        // D14 in substance, not in wording. The failure this guards is an arc
        // parented to the gate group: it would simply be absent on a scene that
        // has no gate group.
        //
        // The premise is READ OFF the real builder rather than restated in a
        // comment, because restating it went stale inside one cycle. The text
        // here used to say Rolling Hills and Open Country both "return early
        // from the gate path, so neither calls createGateStructure" - and Cycle
        // 117 P4 gave the island a real fenced pasture, so
        // `buildSinglePlayerStructures` now takes the enclosure arm and
        // `buildPenEnclosure` builds a gate assembly through that very
        // function. The two scenes are opposite premises now, and the arc rule
        // has to hold across both.
        const { StructureBuilder, resolveSceneEnclosure } = await import('../js/StructureBuilder.js');
        const { FieldConfig } = await import('../js/FieldConfig.js');

        const gateGroupsBuiltFor = (sceneDef) => {
            const sb = new StructureBuilder(new THREE.Scene());
            sb.fencePresets.useGLBModels = false;
            // The same three options `js/boot/initWorld.js` passes.
            sb.buildSinglePlayerStructures(
                FieldConfig.getBounds(),
                FieldConfig.getGate(),
                FieldConfig.getPasture(),
                {
                    perimeterFence: sceneDef.perimeterFence !== false,
                    corral: sceneDef.corral || null,
                    enclosure: resolveSceneEnclosure(sceneDef),
                },
            );
            return sb.structures.gates.length;
        };

        expect(gateGroupsBuiltFor(openCountry), 'the corral arm builds no gate group').toBe(0);
        expect(gateGroupsBuiltFor(rollingHills), 'the enclosure arm does build one').toBe(1);

        for (const sceneDef of [rollingHills, openCountry]) {
            const game = fakeGame(sceneDef, { groundY: slopedGround });
            expect(arcsIn(game.scene).length).toBe(0);
            bindGateCue(game);
            expect(arcsIn(game.scene).length, `${sceneDef.id} drew exactly one arc`).toBe(1);
        }
    });

    it('parents the arc to the scene, not to a structure group', () => {
        const game = fakeGame(field);
        const cue = bindGateCue(game);
        expect(cue.arc.mesh.parent).toBe(game.scene);
    });

    it('is owned by the cue and never by the fence or structure builders', () => {
        // The regression is not a wrong number, it is a wrong owner: the moment
        // the arc is built from inside createGateStructure it ships on two
        // scenes out of four and no numeric assertion notices.
        for (const file of ['js/FencePresets.js', 'js/StructureBuilder.js']) {
            expect(source(file), `${file} must not build the cue's arc`)
                .not.toMatch(/GateThresholdArc/);
        }
        expect(source('js/effects/GateColumn.js')).toMatch(/GateThresholdArc\.js/);
    });

    it('follows the objective when Open Country moves its destination', () => {
        const roundup = resolveGateDescriptor(openCountry, { objective: { stage: 'roundup' } });
        const drive = resolveGateDescriptor(openCountry, { objective: { stage: 'drive' } });
        expect(drive.position.z).not.toBe(roundup.position.z);

        const game = fakeGame(openCountry);
        game.gameState = { objective: { stage: 'drive' } };
        bindGateCue(game);
        const radii = radiiFrom(verticesOf(arcsIn(game.scene)[0].geometry), drive.position);
        expect((Math.min(...radii) + Math.max(...radii)) / 2)
            .toBeCloseTo(gateThresholdRadius(drive), 2);
    });
});

describe('the cue import graph only points one way', () => {
    /**
     * This is a bundle guard, and it is the one thing in this file that is not
     * about pixels. `js/world/gateThreshold.js` is in the eagerly loaded
     * `main-*.js` chunk because `js/FencePresets.js` calls `applyGatePostRim`
     * while it is building a gate. `js/world/gateCue.js` and the two effect
     * modules are not: they are fetched on demand when a scene builds.
     *
     * Rollup assigns a module to a chunk by which entry points reach it, so an
     * import from the eager module into the lazy one moves the whole lazy module
     * into the measured chunk. Measured while writing this phase: +2,663 bytes,
     * against 80 bytes of remaining headroom on a ratchet the cycle plan fences.
     * An import the other way round costs nothing.
     *
     * Every name is available from `gateCue.js`, so the rule has no cost at the
     * call site and no judgement call: the lazy graph imports from `gateCue.js`,
     * and `gateThreshold.js` imports from nothing.
     */
    const importsIn = (file) =>
        [...source(file).matchAll(/^\s*(?:import|export)[\s\S]*?from\s+'([^']+)'/gm)]
            .map((m) => m[1]);

    it('never lets the eagerly loaded module reach into the lazy one', () => {
        const imports = importsIn('js/world/gateThreshold.js');
        expect(imports, 'gateThreshold.js is in main-*.js and must import nothing')
            .toEqual([]);
    });

    it('never lets the lazy cue modules reach into the eagerly loaded one', () => {
        for (const file of ['js/effects/GateThresholdArc.js', 'js/effects/GateColumn.js']) {
            const offenders = importsIn(file).filter((s) => s.includes('gateThreshold'));
            expect(offenders, `${file} must take the cue's numbers from gateCue.js`).toEqual([]);
        }
    });

    it('leaves gateCue.js as the one place the lazy graph reads', () => {
        // The harmless direction, and the one that keeps a single declaration of
        // each number: gateCue.js re-exports what the fence builder owns.
        expect(importsIn('js/world/gateCue.js')).toContain('./gateThreshold.js');
        for (const name of ['GATE_CUE_NEAR_DISTANCE', 'GATE_CUE_WARM_LINEAR', 'GATE_RIM_MATERIALS_KEY']) {
            expect(source('js/world/gateThreshold.js'), `${name} declared once`)
                .toMatch(new RegExp(`export const ${name}\\b`));
            expect(source('js/world/gateCue.js'), `${name} not re-declared`)
                .not.toMatch(new RegExp(`export const ${name}\\b`));
        }
    });
});

describe('the arc follows the heightfield instead of floating over it', () => {
    it.each(DESTINATIONS)('%s takes every vertex Y from the ground under that vertex', (_label, sceneDef, gameState) => {
        const descriptor = resolveGateDescriptor(sceneDef, gameState);
        const { geometry } = buildGateArcGeometry(descriptor, slopedGround);
        const vertices = verticesOf(geometry);

        for (const v of vertices) {
            expect(v.y).toBeCloseTo(slopedGround(v.x, v.z) + GATE_ARC_GROUND_LIFT_M, 3);
        }
        // And it actually moved: a build that sampled the centre once would pass
        // nothing above but would be dead flat here.
        const ys = vertices.map((v) => v.y);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(1);
    });

    it('sits just above the ground rather than on it or through it', () => {
        expect(GATE_ARC_GROUND_LIFT_M).toBeGreaterThan(0);
        expect(GATE_ARC_GROUND_LIFT_M).toBeLessThan(0.25);
    });

    it('reads _groundY and not the raw heightfield sample', () => {
        // .claude/rules/scene-and-render.md: only _groundY applies the terrain
        // mesh's smoothstep-to-zero skirt. The fake's heightfield reads 40m
        // higher, so a build on `sample` lands 40m into the air.
        const game = fakeGame(newsheepdogland, { groundY: slopedGround });
        const cue = bindGateCue(game);
        expect(game.terrainBuilder._groundY).toHaveBeenCalled();

        const vertices = verticesOf(cue.arc.mesh.geometry);
        for (const v of vertices) {
            expect(v.y).toBeCloseTo(slopedGround(v.x, v.z) + GATE_ARC_GROUND_LIFT_M, 3);
        }
    });

    it('tessellates finely enough that a chord cannot lift off a slope', () => {
        // The strip is straight between vertices, so the segment length bounds
        // how far the arc can cut a corner off the terrain. Checked on the
        // largest destination that ships, where the error would be worst.
        const descriptor = resolveGateDescriptor(openCountry, { objective: { stage: 'roundup' } });
        const { geometry, radius, sweep, segments } = buildGateArcGeometry(descriptor, () => 0);
        expect((sweep * radius) / segments).toBeLessThan(2);
        expect(geometry.getAttribute('position').count).toBe((segments + 1) * 2);
    });
});

describe('a mouth is swept, a boundary is closed', () => {
    it('draws a gate arc only on the side the flock arrives from', () => {
        for (const sceneDef of [field, newsheepdogland]) {
            const descriptor = resolveGateDescriptor(sceneDef, null);
            expect(descriptor.kind).toBe('gate');
            const { geometry, radius } = buildGateArcGeometry(descriptor, () => 0);
            const f = descriptor.facing;

            let deepest = 0;
            for (const v of verticesOf(geometry)) {
                // `facing` is the direction of travel INTO the destination, so
                // a positive projection is a vertex drawn past the mouth, inside
                // the pen the flock is being driven into.
                const along = (v.x - descriptor.position.x) * f.x + (v.z - descriptor.position.z) * f.z;
                expect(along, `${sceneDef.id} drew through the gate`).toBeLessThan(radius * 1e-3);
                deepest = Math.min(deepest, along);
            }
            // And it sweeps the whole approach half rather than a token nick.
            expect(deepest, `${sceneDef.id} approach sweep`).toBeLessThan(-radius * 0.9);
        }
    });

    it('closes a disc destination into a full boundary', () => {
        // Cycle 117 P2: Rolling Hills was the second disc here and is now a
        // gate, so the pair is Open Country's two stages - the gather zone and,
        // once the stage flips, the portal. Two kinds, one disc rule.
        for (const [sceneDef, gameState] of [
            [openCountry, null],
            [openCountry, { objective: { stage: 'drive' } }],
        ]) {
            const descriptor = resolveGateDescriptor(sceneDef, gameState);
            expect(descriptor.kind).not.toBe('gate');
            const { geometry, radius } = buildGateArcGeometry(descriptor, () => 0);
            const f = descriptor.facing;
            const along = verticesOf(geometry).map(
                (v) => (v.x - descriptor.position.x) * f.x + (v.z - descriptor.position.z) * f.z,
            );
            // The disc's own boundary is where the sheep have to end up, so the
            // arc has to be on both sides of it.
            expect(Math.max(...along)).toBeGreaterThan(radius * 0.9);
            expect(Math.min(...along)).toBeLessThan(-radius * 0.9);
        }
    });

    it('splits on kind and never on scene identity', () => {
        // Hard stop 3. Home Field, Newsheepdogland and (since Cycle 117 P2) the
        // Rolling Hills pasture share the gate sweep without any of them being
        // named; Open Country's two disc stages share the other.
        const kindOf = (sceneDef, state) => resolveGateDescriptor(sceneDef, state).kind;
        expect(gateArcSweep({ kind: kindOf(field, null) }))
            .toBe(gateArcSweep({ kind: kindOf(newsheepdogland, null) }));
        expect(gateArcSweep({ kind: kindOf(field, null) }))
            .toBe(gateArcSweep({ kind: kindOf(rollingHills, null) }));
        expect(gateArcSweep({ kind: kindOf(openCountry, null) }))
            .toBe(gateArcSweep({ kind: kindOf(openCountry, { objective: { stage: 'drive' } }) }));
        expect(gateArcSweep({ kind: 'gate' })).toBeLessThan(gateArcSweep({ kind: 'corral' }));
        expect(source('js/effects/GateThresholdArc.js')).not.toMatch(
            /rolling-hills|open-country|newsheepdogland|sceneDef\.id/,
        );
    });
});

describe('the near state hands over from the far state', () => {
    const descriptor = resolveGateDescriptor(field, null);

    it('brightens the arc exactly as gateThresholdOpacity says, at every distance', () => {
        const dogRef = { position: null };
        const { cue } = scriptedCue(field, null, dogRef);
        for (let d = 0; d <= GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN + 10; d += 2.5) {
            dogRef.position = dogAt(descriptor, d);
            cue.update(0.016);
            expect(cue.arc.material.opacity, `${d}m`).toBeCloseTo(gateThresholdOpacity(d, 0), 9);
        }
    });

    it('crossfades the two halves of the cue instead of stacking them', () => {
        // The handover is a crossfade across the fade band, not a switch, so
        // "never both visible" is the wrong property and asserting it would
        // outlaw the design. The right one is that the two meshes are driven
        // off ONE decision: their normalised strengths sum to exactly 1 at every
        // distance, so neither can gain without the other giving it up. Outside
        // the band the sum resolves to exactly one of them at full.
        const dogRef = { position: null };
        const { cue } = scriptedCue(field, null, dogRef);
        const far = GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN;

        let previousColumn = -1;
        let previousArc = Infinity;
        for (let d = 0; d <= 200; d += 1) {
            dogRef.position = dogAt(descriptor, d);
            cue.update(0.016);
            const column = cue.column.material.opacity / GATE_COLUMN_OPACITY;
            const arc = cue.arc.material.opacity / GATE_THRESHOLD_BASE_OPACITY;

            expect(column + arc, `${d}m does not conserve the cue`).toBeCloseTo(1, 9);
            expect(column, `${d}m column went backwards`).toBeGreaterThanOrEqual(previousColumn);
            expect(arc, `${d}m arc went backwards`).toBeLessThanOrEqual(previousArc);
            previousColumn = column;
            previousArc = arc;

            if (d <= GATE_CUE_NEAR_DISTANCE) {
                expect(cue.column.mesh.visible, `${d}m column inside the threshold`).toBe(false);
                expect(cue.arc.mesh.visible, `${d}m arc inside the threshold`).toBe(true);
            }
            if (d >= far) {
                expect(cue.arc.mesh.visible, `${d}m arc beyond the band`).toBe(false);
                expect(cue.column.mesh.visible, `${d}m column beyond the band`).toBe(true);
            }
            // And something always says where the destination is.
            expect(cue.arc.mesh.visible || cue.column.mesh.visible, `${d}m silent`).toBe(true);
        }
    });

    it('brightens in proportion to how full the funnel is', () => {
        // The Phase 4 seam, driven here so the composition is proven now rather
        // than discovered later: the arc already routes occupancy through
        // gateThresholdOpacity, so Phase 4 wires a getter and nothing else.
        const dogRef = { position: dogAt(descriptor, 5) };
        let occupancy = 0;
        const { cue } = scriptedCue(field, null, dogRef, { getOccupancy: () => occupancy });

        cue.update(0.016);
        const empty = cue.arc.material.opacity;
        expect(empty).toBeCloseTo(GATE_THRESHOLD_BASE_OPACITY, 9);

        occupancy = 0.5;
        cue.update(0.016);
        const half = cue.arc.material.opacity;
        occupancy = 1;
        cue.update(0.016);
        const full = cue.arc.material.opacity;

        expect(half).toBeCloseTo(gateThresholdBrightness(0.5), 9);
        expect(full).toBeCloseTo(gateThresholdBrightness(1), 9);
        // Proportional: half the funnel is half the lift.
        expect(half - empty).toBeCloseTo(full - half, 9);
    });

    it('is dark on the frame it is built when the dog is nowhere near', () => {
        const { cue } = scriptedCue(field, null, { position: null });
        expect(cue.arc.mesh.visible).toBe(false);
        expect(cue.arc.material.opacity).toBe(0);
    });
});

describe('the gate posts warm from the same distance', () => {
    /** A gate structure shaped exactly the way js/FencePresets.js publishes one. */
    function gateWithRim() {
        const group = new THREE.Group();
        const inner = new THREE.Group();
        const material = new THREE.MeshStandardMaterial();
        material.emissiveIntensity = 0;
        inner.userData[GATE_RIM_MATERIALS_KEY] = [material];
        group.add(inner);
        return { group, material };
    }

    it('drives the published rim materials from the cue distance', () => {
        const { group, material } = gateWithRim();
        const descriptor = resolveGateDescriptor(field, null);
        const game = fakeGame(field, { gates: [group], dog: dogAt(descriptor, 1) });
        const cue = bindGateCue(game);

        expect(material.emissiveIntensity).toBeCloseTo(GATE_POST_RIM_PEAK_INTENSITY, 9);

        game.sheepdog.position = dogAt(descriptor, GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN);
        cue.update(0.016);
        expect(material.emissiveIntensity).toBe(0);

        const mid = GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN / 2;
        game.sheepdog.position = dogAt(descriptor, mid);
        cue.update(0.016);
        expect(material.emissiveIntensity)
            .toBeCloseTo(gateRimFactor(mid) * GATE_POST_RIM_PEAK_INTENSITY, 9);
    });

    it('leaves the posts dark when the cue goes away', () => {
        // The materials belong to the fence system's GLB cache and outlive the
        // cue, so a swap that stopped driving them would leave the previous
        // scene's gate lit for the session.
        const { group, material } = gateWithRim();
        const descriptor = resolveGateDescriptor(field, null);
        const game = fakeGame(field, { gates: [group], dog: dogAt(descriptor, 1) });
        bindGateCue(game);
        expect(material.emissiveIntensity).toBeGreaterThan(0);

        game.currentScene = { id: 'bare', bounds: field.bounds };
        expect(bindGateCue(game)).toBeNull();
        expect(material.emissiveIntensity).toBe(0);
    });
});

describe('a scene swap leaves no arc behind', () => {
    it('removes and disposes the arc on rebind', () => {
        const game = fakeGame(field);
        const first = bindGateCue(game);
        const geometryDispose = vi.spyOn(first.arc.mesh.geometry, 'dispose');
        const materialDispose = vi.spyOn(first.arc.material, 'dispose');

        game.currentScene = rollingHills;
        bindGateCue(game);

        expect(geometryDispose).toHaveBeenCalled();
        expect(materialDispose).toHaveBeenCalled();
        const arcs = arcsIn(game.scene);
        expect(arcs.length).toBe(1);
        const hills = resolveGateDescriptor(rollingHills, null);
        const radii = radiiFrom(verticesOf(arcs[0].geometry), hills.position);
        expect((Math.min(...radii) + Math.max(...radii)) / 2)
            .toBeCloseTo(gateThresholdRadius(hills), 2);
    });

    it('clears the arc when the next scene declares no destination', () => {
        const game = fakeGame(field);
        bindGateCue(game);
        game.currentScene = { id: 'bare', bounds: field.bounds };
        bindGateCue(game);
        expect(arcsIn(game.scene).length).toBe(0);
    });
});

describe('both render paths, one material, no new THREE class', () => {
    const arcMaterial = () => bindGateCue(fakeGame(field)).arc.material;

    it('is a stock unlit material with no hand-written twin to keep in step', () => {
        const m = arcMaterial();
        expect(m.isShaderMaterial).toBeFalsy();
        expect(Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')).toBe(false);
    });

    it('is converted to a node material by Three itself on the WebGPU path', async () => {
        const { StandardNodeLibrary, MeshBasicNodeMaterial } = await import('three/webgpu');
        const src = createGateThresholdArc({
            scene: new THREE.Scene(),
            descriptor: resolveGateDescriptor(field, null),
            groundY: () => 0,
        });
        src.setOpacity(0.5);
        const converted = new StandardNodeLibrary().fromMaterial(src.material);
        expect(converted).toBeInstanceOf(MeshBasicNodeMaterial);
        // Every property the arc drives rides across, so one write lands twice.
        expect(converted.opacity).toBe(0.5);
        expect(converted.color.getHex()).toBe(src.material.color.getHex());
        expect(converted.blending).toBe(THREE.AdditiveBlending);
        expect(converted.fog).toBe(false);
        expect(converted.depthWrite).toBe(false);
        expect(converted.transparent).toBe(true);
    });

    it('is occluded by terrain and occludes nothing itself', () => {
        const m = arcMaterial();
        expect(m.depthTest).toBe(true);
        expect(m.depthWrite).toBe(false);
    });

    it('introduces no THREE class the built bundle does not already carry', () => {
        // Hard stop 5: three-*.js has 423 bytes of headroom. TorusGeometry is
        // not free; a hand-built BufferGeometry costs nothing.
        const free = ['BufferGeometry', 'CylinderGeometry', 'RingGeometry', 'CircleGeometry', 'PlaneGeometry'];
        expect(free).toContain(bindGateCue(fakeGame(field)).arc.mesh.geometry.type);
        const text = source('js/effects/GateThresholdArc.js');
        expect(text).not.toMatch(/THREE\.(Torus|Lathe|Tube|Extrude|Shape|Text|Point|Spot|Rect|Hemisphere)/);
    });

    it('paints in the one warm the whole cue shares, in the space that warm is stated in', () => {
        // GATE_CUE_WARM_LINEAR is linear RGB, and `Color.setRGB` writes in the
        // working colour space, which is linear. A `setHex` here would silently
        // apply an sRGB decode and put the arc a decode away from the post rim
        // that shares the constant.
        const m = arcMaterial();
        expect(m.color.r).toBeCloseTo(GATE_CUE_WARM_LINEAR[0], 6);
        expect(m.color.g).toBeCloseTo(GATE_CUE_WARM_LINEAR[1], 6);
        expect(m.color.b).toBeCloseTo(GATE_CUE_WARM_LINEAR[2], 6);
    });
});
