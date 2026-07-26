// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * The gate cue's far state: one column, one hook, one dispose (Cycle 116
 * Phase 2).
 *
 * Four failure modes this file exists for.
 *
 * ONE: two answers to "where is the destination and how far away is it". The
 * column fades across a distance and the screen-edge chevron hides at a
 * projection, and the moment those two are worked out in two files they drift
 * and the cue starts showing both halves at once (or neither). Since Phase 5
 * the cue resolves it once and PUBLISHES it, and the chevron renders what it is
 * given; the tests below assert the handover property on the published state
 * and the source guard fails if the chevron grows back any of the inputs it
 * used to derive for itself (the scene table, the camera, game state, three).
 *
 * TWO: a cue that survives a scene swap. The column is scene-graph geometry at
 * the previous scene's destination, so a missed dispose draws a warm beam in
 * the sea off Rolling Hills. The swap test runs the REAL
 * js/boot/loadScene.js#disposeScene against a built cue rather than asserting
 * that a teardown function was called.
 *
 * THREE: a second per-frame hook. Phases 3-B and 4 extend this controller in
 * place; three phases each threading their own call into main.js is how the
 * arc and the column end up disagreeing about how far away the dog is. The
 * structural guard counts the hooks.
 *
 * FOUR: a single-path visual. Production boots WebGPU, and every hand-written
 * WebGL shader in the repo has a node twin that has to be kept in step by hand.
 * The column deliberately has none: it is a stock MeshBasicMaterial, which
 * Three's own NodeLibrary conversion turns into a MeshBasicNodeMaterial with
 * the same colour, opacity, blending and fog properties. The material test
 * asserts that shape, because the day someone reaches for a ShaderMaterial here
 * is the day the column exists on half the machines.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import * as THREE from 'three';

/**
 * `cueView` is the whole of the chevron's input since Phase 5. It used to reach
 * for `getGameState` and `getSceneManager` and resolve the destination, the
 * distance and the projection itself; now the cue publishes all of that and the
 * bridge hands it over, so a test drives the component by handing it a view.
 */
const bridge = vi.hoisted(() => ({ gameState: null, sceneManager: null, cueView: null }));

vi.mock('../js/GameBridge.js', () => ({
    getGameState: () => bridge.gameState,
    getSceneManager: () => bridge.sceneManager,
    getGateCueView: () => bridge.cueView,
    subscribeGameEvent: () => () => {},
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k) => k, i18n: {} }),
}));

import {
    resolveGateDescriptor,
    resolveGateCueVisibility,
    GATE_CUE_NEAR_DISTANCE,
    GATE_CUE_COLUMN_FADE_SPAN,
    GATE_CUE_WARM_LINEAR,
} from '../js/world/gateCue.js';
import {
    bindGateCue,
    createGateCue,
    gateColumnRadius,
    GATE_COLUMN_HEIGHT,
    GATE_COLUMN_OPACITY,
} from '../js/effects/GateColumn.js';
import { disposeScene } from '../js/boot/loadScene.js';
import { CorralCompass } from '../js/components/GameHUD/CorralCompass.tsx';
import { field } from '../shared/scenes/field.js';
import { rollingHills } from '../shared/scenes/rolling-hills.js';

const REPO = resolve(import.meta.dirname, '..');
const source = (relative) => readFileSync(resolve(REPO, relative), 'utf8');

/** Minimal SheepDogSimulation shape: exactly what bindGateCue reads. */
function fakeGame(sceneDef, { ground = 0, dog = null } = {}) {
    const scene = new THREE.Scene();
    return {
        currentScene: sceneDef,
        gameState: null,
        sheepdog: dog ? { position: dog } : null,
        sceneManager: { getScene: () => scene },
        terrainBuilder: { _groundY: vi.fn(() => ground) },
        // The trap: a heightfield that disagrees with the terrain the player
        // sees. Anything reading it instead of _groundY floats over the skirt.
        heightfield: { sample: () => ground + 40 },
        scene,
    };
}

const columnOf = (game) => game.scene.children.filter((c) => c.name === 'gate-cue-column');

/** A cue with no game attached, for driving `update` against a scripted dog. */
function scriptedCue(sceneDef, dogRef, ground = 0) {
    const scene = new THREE.Scene();
    const cue = createGateCue({
        scene,
        descriptor: resolveGateDescriptor(sceneDef, null),
        groundY: () => ground,
        getDogPosition: () => dogRef.position,
    });
    return { cue, scene };
}

/** Place the dog `distance` metres from the cue's destination. */
function dogAt(descriptor, distance) {
    return { x: descriptor.position.x + distance, z: descriptor.position.z };
}

afterEach(() => {
    cleanup();
    bridge.gameState = null;
    bridge.sceneManager = null;
    bridge.cueView = null;
});

/** A camera at the origin. Three's default look direction is -Z. */
function cameraAtOrigin() {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 5, 0);
    camera.updateMatrixWorld();
    return camera;
}

/** A cue bound to a real scene, with a real camera, publishing a real view. */
function cueWithCamera(sceneDef, camera, dog = { x: 0, z: 0 }) {
    const game = fakeGame(sceneDef, { dog });
    game.sceneManager.getCamera = () => camera;
    const cue = bindGateCue(game);
    bridge.cueView = cue.view;
    return cue;
}

describe('the column stands at the destination, on the ground', () => {
    it('builds one column at the descriptor position for a real scene', () => {
        const game = fakeGame(field);
        const cue = bindGateCue(game);
        const descriptor = resolveGateDescriptor(field, null);

        expect(cue).not.toBeNull();
        const columns = columnOf(game);
        expect(columns.length).toBe(1);
        expect(columns[0].position.x).toBe(descriptor.position.x);
        expect(columns[0].position.z).toBe(descriptor.position.z);
    });

    it('sits its base on the terrain rather than above or far below it', () => {
        const game = fakeGame(field, { ground: 0 });
        const mesh = bindGateCue(game).column.mesh;
        // The mesh is centred, so the base is half a column below its origin.
        const base = mesh.position.y - GATE_COLUMN_HEIGHT / 2;
        expect(base).toBeLessThanOrEqual(0);
        expect(base).toBeGreaterThan(-3);
    });

    it('tracks the ground the terrain mesh draws, through _groundY and not the raw heightfield', () => {
        // .claude/rules/scene-and-render.md: `_groundY` applies the same
        // smoothstep-to-zero over the last 20m of worldSize that the visible
        // mesh uses; `Heightfield.sample` does not, so anything past worldSize
        // built on `sample` hovers over the flat skirt. The fake's heightfield
        // deliberately reads 40m higher than its terrain.
        const flat = fakeGame(field, { ground: 0 });
        const raised = fakeGame(field, { ground: 12 });
        const flatY = bindGateCue(flat).column.mesh.position.y;
        const raisedY = bindGateCue(raised).column.mesh.position.y;

        expect(raisedY - flatY).toBeCloseTo(12, 9);
        const descriptor = resolveGateDescriptor(field, null);
        expect(raised.terrainBuilder._groundY).toHaveBeenCalledWith(
            descriptor.position.x, descriptor.position.z,
        );
    });

    it('clears the treeline', () => {
        // EZ-Tree foliage runs to roughly 18m; a cue the canopy hides is not a
        // cue. Sized against that rather than against a number typed twice.
        expect(GATE_COLUMN_HEIGHT).toBeGreaterThan(2 * 18);
    });

    it('scales its girth with the destination but never past the clamp', () => {
        const gate = resolveGateDescriptor(field, null);
        const zone = resolveGateDescriptor({
            ...field, objective: { roundupZone: { x: 0, z: 50, radius: 30 } },
        }, null);
        expect(zone.width).toBeGreaterThan(gate.width);
        expect(gateColumnRadius(zone.width)).toBeGreaterThan(gateColumnRadius(gate.width));
        // A column as wide as Open Country's 60m gather zone would be a wall.
        expect(gateColumnRadius(zone.width)).toBeLessThan(zone.width / 4);
        expect(gateColumnRadius(0)).toBeGreaterThan(0);
    });
});

describe('the far state renders and the near state does not', () => {
    const descriptor = resolveGateDescriptor(field, null);

    it('renders beyond the near threshold', () => {
        const dogRef = { position: dogAt(descriptor, GATE_CUE_NEAR_DISTANCE + 0.01) };
        const { cue } = scriptedCue(field, dogRef);
        cue.update(0.016);
        expect(cue.column.mesh.visible).toBe(true);
        expect(cue.column.material.opacity).toBeGreaterThan(0);

        dogRef.position = dogAt(descriptor, GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN);
        cue.update(0.016);
        expect(cue.column.material.opacity).toBeCloseTo(GATE_COLUMN_OPACITY, 9);
    });

    it('does not render inside the near threshold', () => {
        const dogRef = { position: dogAt(descriptor, GATE_CUE_NEAR_DISTANCE) };
        const { cue } = scriptedCue(field, dogRef);
        cue.update(0.016);
        expect(cue.column.mesh.visible).toBe(false);
        expect(cue.column.material.opacity).toBe(0);

        dogRef.position = dogAt(descriptor, 1);
        cue.update(0.016);
        expect(cue.column.mesh.visible).toBe(false);
    });

    it('fades across the band instead of popping at the threshold', () => {
        const dogRef = { position: null };
        const { cue } = scriptedCue(field, dogRef);
        const sampled = [];
        for (let d = GATE_CUE_NEAR_DISTANCE; d <= GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN; d += 1) {
            dogRef.position = dogAt(descriptor, d);
            cue.update(0.016);
            sampled.push(cue.column.material.opacity);
        }
        for (let i = 1; i < sampled.length; i++) {
            expect(sampled[i]).toBeGreaterThanOrEqual(sampled[i - 1]);
            // No step in the ramp may exceed a fifth of the range, which is
            // what a hard cut at the threshold would produce.
            expect(sampled[i] - sampled[i - 1]).toBeLessThan(GATE_COLUMN_OPACITY / 5);
        }
        expect(sampled[0]).toBe(0);
        expect(sampled[sampled.length - 1]).toBeCloseTo(GATE_COLUMN_OPACITY, 9);
    });

    it('is already correct on the frame it is built', () => {
        // A cue that applied the decision only from its first update would show
        // a full-strength column for a frame after every scene load, including
        // one built while the dog is standing at the gate.
        const near = scriptedCue(field, { position: dogAt(descriptor, 1) }).cue;
        expect(near.column.mesh.visible).toBe(false);

        // With no dog yet there is no distance, so the destination reads far.
        const noDog = scriptedCue(field, { position: null }).cue;
        expect(noDog.column.mesh.visible).toBe(true);
    });
});

describe('one visibility decision, two surfaces', () => {
    it('hands over rather than stacks, and never leaves the player with nothing', () => {
        for (const distance of [0, 1, GATE_CUE_NEAR_DISTANCE - 1, GATE_CUE_NEAR_DISTANCE,
            GATE_CUE_NEAR_DISTANCE + 1, GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN, 500]) {
            for (const onScreen of [true, false]) {
                const vis = resolveGateCueVisibility({ distance, onScreen });
                const label = `${distance}m onScreen=${onScreen}`;
                // The column is the far state and `near` is the state that
                // takes over from it. They cannot both be on.
                expect(vis.showColumn && vis.near, `${label} stacked`).toBe(false);
                // And something always says where the destination is.
                expect(vis.showColumn || vis.showCompass || vis.near, `${label} silent`).toBe(true);
            }
        }
    });

    it('drives the column from distance alone so a camera swing cannot pop it', () => {
        const far = GATE_CUE_NEAR_DISTANCE + GATE_CUE_COLUMN_FADE_SPAN;
        expect(resolveGateCueVisibility({ distance: far, onScreen: true }).columnOpacity)
            .toBe(resolveGateCueVisibility({ distance: far, onScreen: false }).columnOpacity);
    });

    it('treats a missing or malformed distance as far', () => {
        expect(resolveGateCueVisibility({}).showColumn).toBe(true);
        expect(resolveGateCueVisibility({ distance: NaN }).showColumn).toBe(true);
        expect(resolveGateCueVisibility(null).showColumn).toBe(true);
    });

    it('keeps the chevron as the off-screen fallback, unchanged', () => {
        // Home Field's gate is at (0, 100) and Three's default camera looks
        // down -Z, so the destination is squarely behind the player.
        const cue = cueWithCamera(field, cameraAtOrigin());
        expect(cue.view.behind).toBe(true);
        expect(cue.view.showCompass).toBe(true);
        const { container } = render(createElement(CorralCompass));
        expect(container.querySelector('div')).not.toBeNull();
    });

    it('renders the cue published state and decides nothing itself', () => {
        // Turn to face the gate from 15m out: the cue's own decision puts the
        // destination on-screen, so the chevron hands over to the near state.
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.set(0, 5, 85);
        camera.lookAt(0, 4, 100);
        camera.updateMatrixWorld();
        const cue = cueWithCamera(field, camera, { x: 0, z: 85 });
        expect(cue.view.onScreen).toBe(true);

        expect(render(createElement(CorralCompass)).container.firstChild).toBeNull();
        cleanup();

        // Flip ONLY the published flag, leaving the camera and the scene where
        // they are. The component follows, which it can only do if it is
        // rendering the cue's answer rather than working one out for itself.
        bridge.cueView = { ...cue.view, showCompass: true };
        expect(render(createElement(CorralCompass)).container.firstChild).not.toBeNull();
    });

    it('draws nothing at all when the cue has published nothing', () => {
        // The chevron has exactly one input. No cue (pre-boot, or a scene with
        // no destination) has to mean no chevron, not a chevron pointing at
        // whatever the HUD last managed to resolve for itself.
        bridge.cueView = null;
        bridge.sceneManager = { getCamera: () => cameraAtOrigin() };
        bridge.gameState = { sheepdog: { position: { x: 0, z: 0 } }, corral: { center: { x: 500, z: 500 } } };
        expect(render(createElement(CorralCompass)).container.firstChild).toBeNull();
    });

    it('drives both surfaces off one resolved state', () => {
        // Not "two call sites call the same function": one object. The column's
        // opacity and the chevron's flag are read off the same `cue.view`, so
        // the two halves of the far state cannot disagree about the frame.
        const cue = cueWithCamera(field, cameraAtOrigin(), { x: 0, z: 0 });
        expect(cue.update(0)).toBe(cue.view);
        expect(cue.column.material.opacity)
            .toBeCloseTo(GATE_COLUMN_OPACITY * cue.view.columnOpacity, 9);
        expect(cue.view.showCompass).toBe(!cue.view.onScreen);
    });

    it('keeps the destination, the distance and the projection in the cue', () => {
        const compass = source('js/components/GameHUD/CorralCompass.tsx');
        const column = source('js/effects/GateColumn.js');
        const literal = new RegExp(`(^|[^\\w.])${GATE_CUE_NEAR_DISTANCE}([^\\w.]|$)`);

        // The cue reads the one decision, and nobody carries a second copy of
        // the number it is built on.
        expect(column, 'GateColumn.js must read the shared decision')
            .toMatch(/from '.*gateCue\.js'/);
        expect(literal.test(column), 'GateColumn.js carries its own near threshold').toBe(false);
        expect(literal.test(compass), 'CorralCompass.tsx carries its own near threshold').toBe(false);

        // And the chevron reaches for none of the inputs. Each of these was a
        // second answer to "where are the sheep supposed to go" living in the
        // HUD, and the `gameState.corral` one had already drifted from the
        // cue's scene-def read. It is also what put js/world/gateCue.js in two
        // lazily loaded graphs at once and cost a whole extra chunk.
        const forbidden = [
            [/from ['"][^'"]*\/world\//, 'imports the world layer'],
            [/getSceneById/, 'resolves the destination from the scene table'],
            [/getSceneManager|getCamera/, 'reaches for the camera'],
            [/getGameState/, 'reaches for game state'],
            [/from ['"]three['"]/, 'imports three'],
            [/\.project\(/, 'projects the destination itself'],
        ];
        for (const [pattern, why] of forbidden) {
            expect(compass, `CorralCompass.tsx ${why}`).not.toMatch(pattern);
        }
        expect(compass, 'CorralCompass.tsx must read the published view')
            .toMatch(/getGateCueView/);
    });
});

describe('the chevron projects from the destination\'s own ground (Cycle 117 P8)', () => {
    // `CUE_PROJECT_HEIGHT_M` moved out of CorralCompass.tsx as a bare world Y,
    // which was right for every scene that had a destination when it was
    // written: Home Field's gate ground is 0, so "4" meant what it said. Rolling
    // Hills' pasture gate stands at 27.86m, so the cue was projecting a point
    // 23.9m inside the hill and answering `onScreen`, `showCompass` and `near`
    // off it. Measured in the browser (cycle117-validation/PROBE_FINDINGS.md,
    // defect 3): 12m from the gate with the gate filling the frame, `onScreen`
    // read false and the screen-edge chevron was pinned on.
    const ISLAND_GROUND = 27.86;
    const GATE = resolveGateDescriptor(rollingHills, null);

    /** A cue on ground `ground`, with a real camera and a scripted dog. */
    function islandCue(camera, { ground = ISLAND_GROUND, dog = null } = {}) {
        return createGateCue({
            scene: new THREE.Scene(),
            descriptor: GATE,
            groundY: () => ground,
            getDogPosition: () => dog,
            getCamera: () => camera,
        });
    }

    function facing(from, at) {
        const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
        camera.position.copy(from);
        camera.lookAt(at);
        camera.updateMatrixWorld();
        return camera;
    }

    it('projects 4m above the destination\'s ground, not 4m above sea level', () => {
        const eye = new THREE.Vector3(GATE.position.x, ISLAND_GROUND + 2, GATE.position.z + 30);
        const camera = facing(eye, new THREE.Vector3(GATE.position.x, ISLAND_GROUND + 2, GATE.position.z));
        const cue = islandCue(camera);

        const aboveGround = new THREE.Vector3(GATE.position.x, ISLAND_GROUND + 4, GATE.position.z)
            .project(camera);
        const atSeaLevel = new THREE.Vector3(GATE.position.x, 4, GATE.position.z).project(camera);

        expect(cue.view.ndcY).toBeCloseTo(aboveGround.y, 9);
        // And the two answers are nowhere near each other: a whole viewport
        // apart, which is why the defect showed up as a state flip and not as
        // a wobble.
        expect(Math.abs(aboveGround.y - atSeaLevel.y)).toBeGreaterThan(1);
        cue.dispose();
    });

    it('reads the gate as on-screen while the player is standing in its mouth', () => {
        const dog = { x: GATE.position.x, z: GATE.position.z + 12 };
        const camera = facing(
            new THREE.Vector3(dog.x, ISLAND_GROUND + 2, dog.z),
            new THREE.Vector3(GATE.position.x, ISLAND_GROUND + 4, GATE.position.z),
        );
        const cue = islandCue(camera, { dog });

        expect(cue.view.behind).toBe(false);
        expect(cue.view.onScreen).toBe(true);
        expect(cue.view.showCompass).toBe(false);
        cue.dispose();
    });

    it('is unchanged on a scene whose destination sits at y = 0', () => {
        // Home Field is the reason the constant read the way it did, so the fix
        // has to leave it exactly where it was.
        const gate = resolveGateDescriptor(field, null);
        const camera = facing(
            new THREE.Vector3(gate.position.x, 2, gate.position.z - 30),
            new THREE.Vector3(gate.position.x, 4, gate.position.z),
        );
        const cue = createGateCue({
            scene: new THREE.Scene(),
            descriptor: gate,
            groundY: () => 0,
            getDogPosition: () => null,
            getCamera: () => camera,
        });
        const legacy = new THREE.Vector3(gate.position.x, 4, gate.position.z).project(camera);
        expect(cue.view.ndcX).toBeCloseTo(legacy.x, 12);
        expect(cue.view.ndcY).toBeCloseTo(legacy.y, 12);
        cue.dispose();
    });
});

describe('a scene swap leaves nothing behind', () => {
    it('is torn down by the real disposeScene', async () => {
        const game = fakeGame(field);
        const cue = bindGateCue(game);
        const geometryDispose = vi.spyOn(cue.column.mesh.geometry, 'dispose');
        const materialDispose = vi.spyOn(cue.column.material, 'dispose');
        expect(columnOf(game).length).toBe(1);

        await disposeScene(game);

        expect(game._gateCue).toBeNull();
        expect(columnOf(game).length).toBe(0);
        expect(geometryDispose).toHaveBeenCalled();
        expect(materialDispose).toHaveBeenCalled();
    });

    it('clears the previous scene even when the next one has no destination', () => {
        const game = fakeGame(field);
        bindGateCue(game);
        expect(columnOf(game).length).toBe(1);

        // The unconditional-bind case: a scene declaring nothing must clear the
        // cue, not inherit one. Guarding the call with `if (sceneDef.gate)` is
        // exactly the shape that strands the previous scene's column.
        game.currentScene = { id: 'bare', bounds: field.bounds };
        expect(bindGateCue(game)).toBeNull();
        expect(game._gateCue).toBeNull();
        expect(columnOf(game).length).toBe(0);
    });

    it('rebinds onto the new scene destination without leaving the old one standing', () => {
        const game = fakeGame(field);
        bindGateCue(game);
        game.currentScene = rollingHills;
        bindGateCue(game);

        const columns = columnOf(game);
        const hills = resolveGateDescriptor(rollingHills, null);
        expect(columns.length).toBe(1);
        expect(columns[0].position.x).toBe(hills.position.x);
        expect(columns[0].position.z).toBe(hills.position.z);
        expect(columns[0].position.x).not.toBe(resolveGateDescriptor(field, null).position.x);
    });
});

describe('one hook, one construct site, one dispose', () => {
    it('has exactly one per-frame hook in main.js', () => {
        const hooks = source('js/main.js').match(/_gateCue/g) ?? [];
        expect(hooks.length, 'main.js should hold one cue hook and nothing else').toBe(1);
    });

    it('binds unconditionally from the scene-body build', () => {
        const text = source('js/boot/initWorld.js');
        expect((text.match(/bindGateCue\(/g) ?? []).length).toBe(1);
        // No scene guard around it: the bind is what clears a stale cue.
        expect(text).not.toMatch(/if \([^)]*\)\s*\{?\s*bindGateCue/);
    });

    it('disposes from the one teardown entry', () => {
        expect((source('js/boot/loadScene.js').match(/_gateCue/g) ?? []).length).toBeGreaterThan(0);
    });
});

describe('both render paths, one material', () => {
    const material = () => bindGateCue(fakeGame(field)).column.material;

    it('paints in the one warm the arc paints in, in the space that warm is stated in', () => {
        // D13 is "warm means go there", singular. Phases 2 and 3-B shipped the
        // column as a hex (0xffc98a) and the arc as a linear triple, which put
        // the two halves of one visual language an sRGB decode apart - the
        // exact failure js/world/gateThreshold.js warns about where it declares
        // the constant. Both surfaces now paint through `mountCueSurface`.
        const cue = bindGateCue(fakeGame(field));
        for (const channel of ['r', 'g', 'b']) {
            expect(cue.column.material.color[channel])
                .toBeCloseTo(cue.arc.material.color[channel], 9);
        }
        expect(cue.column.material.color.r).toBeCloseTo(GATE_CUE_WARM_LINEAR[0], 6);
        expect(cue.column.material.color.g).toBeCloseTo(GATE_CUE_WARM_LINEAR[1], 6);
        expect(cue.column.material.color.b).toBeCloseTo(GATE_CUE_WARM_LINEAR[2], 6);
    });

    it('is a stock unlit material with no hand-written twin to keep in step', () => {
        const m = material();
        expect(m.isShaderMaterial).toBeFalsy();
        expect(Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')).toBe(false);
    });

    it('is converted to a node material by Three itself on the WebGPU path', async () => {
        // The dual-path claim, asked of Three rather than asserted from a
        // comment: production boots WebGPU, and the renderer swaps stock
        // materials for node materials through this library
        // (StandardNodeLibrary registers MeshBasicMaterial -> MeshBasicNodeMaterial).
        // A ShaderMaterial or any unregistered type comes back null here, which
        // is the column existing on WebGL only.
        const { StandardNodeLibrary, MeshBasicNodeMaterial } = await import('three/webgpu');
        const source = material();
        const converted = new StandardNodeLibrary().fromMaterial(source);
        expect(converted).toBeInstanceOf(MeshBasicNodeMaterial);
        // And every property the cue drives rides across with it, so one write
        // lands on both paths.
        expect(converted.opacity).toBe(source.opacity);
        expect(converted.blending).toBe(THREE.AdditiveBlending);
        expect(converted.fog).toBe(false);
        expect(converted.depthWrite).toBe(false);
        expect(converted.transparent).toBe(true);
    });

    it('is occluded by terrain and occludes nothing itself', () => {
        const m = material();
        expect(m.depthTest).toBe(true);
        expect(m.depthWrite).toBe(false);
        expect(m.transparent).toBe(true);
    });

    it('does not dim into the haze it exists to be legible through', () => {
        expect(material().fog).toBe(false);
    });

    it('uses only geometry already in the built three chunk', () => {
        // Cycle 116 hard stop 5: three-*.js has 423 bytes of headroom, so the
        // cue may use only classes the bundle already carries. TorusGeometry is
        // not one of them.
        const free = ['CylinderGeometry', 'RingGeometry', 'CircleGeometry', 'PlaneGeometry'];
        expect(free).toContain(bindGateCue(fakeGame(field)).column.mesh.geometry.type);
    });
});
