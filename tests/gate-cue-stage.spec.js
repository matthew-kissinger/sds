// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * The cue follows the destination when the destination MOVES (Cycle 116).
 *
 * THE REGRESSION THIS FILE EXISTS FOR. `resolveGateDescriptor` reads
 * `objective.stage`, so Open Country has two destinations: the round-up zone at
 * (0, 50) while the flock is being gathered, and the portal at (0, 295) once the
 * hold completes. The descriptor was resolved ONCE, in `bindGateCue`, which runs
 * only during a scene build, and nothing re-resolved it when the stage flipped.
 * The column's position and the arc's world-space vertices are both baked at
 * construction, so every surface of the cue sat 245m from the real destination
 * for the whole second half of every Open Country run, while the screen-edge
 * chevron re-resolved live and correctly pointed at the portal. The player was
 * being told two different things by one visual language, which is D14 broken in
 * substance.
 *
 * It also means the descriptor's `portal` kind, which `gateCue.js` declares and
 * the arc's per-kind sweep branches on, was UNREACHABLE in play: a rebuild resets
 * `gameState.objective`, so the stage was always `roundup` at bind time. The
 * tests below drive the real flip and assert the portal state is what actually
 * lands, rather than asserting only that a rebuild happened.
 *
 * THREE WAYS THE FIX ITSELF COULD GO WRONG, each with a test.
 *
 * ONE: a cue per flip. The cue is scene-graph geometry, so a re-bind that adds
 * without disposing leaves a column standing at the gather zone forever - the
 * exact defect, with an extra beam.
 *
 * TWO: a listener that outlives its scene. The cue registers on `window`; if the
 * registration is not removed by the cue's own dispose, a stage event fired after
 * a scene swap rebuilds a cue onto a torn-down scene.
 *
 * THREE: a renamed event. `js/GameState.js` and `js/boot/initNetwork.js` are in
 * the eagerly loaded chunk and dispatch a bare literal rather than importing the
 * cue's constant (that import would drag the cue graph into the measured
 * `main-*.js` ratchet). Nothing but a source guard keeps the two ends spelled the
 * same, so the guard is here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';

import { resolveGateDescriptor, OBJECTIVE_STAGE_EVENT } from '../js/world/gateCue.js';
import { bindGateCue } from '../js/effects/GateColumn.js';
import { gateArcSweep } from '../js/effects/GateThresholdArc.js';
import { disposeScene } from '../js/boot/loadScene.js';
import { openCountry } from '../shared/scenes/open-country.js';
import { field } from '../shared/scenes/field.js';

const REPO = resolve(import.meta.dirname, '..');
const source = (relative) => readFileSync(resolve(REPO, relative), 'utf8');

const COLUMN = 'gate-cue-column';
const ARC = 'gate-cue-threshold-arc';

/** Minimal SheepDogSimulation shape: exactly what bindGateCue reads. */
function fakeGame(sceneDef, gameState) {
    const scene = new THREE.Scene();
    return {
        currentScene: sceneDef,
        gameState,
        sheepdog: null,
        sceneManager: { getScene: () => scene },
        terrainBuilder: { _groundY: vi.fn(() => 0) },
        scene,
    };
}

const named = (scene, name) => scene.children.filter((c) => c.name === name);

/** The live stage flip, exactly as GameState and initNetwork dispatch it. */
function flipToDrive(game) {
    game.gameState.objective.stage = 'drive';
    window.dispatchEvent(new CustomEvent(OBJECTIVE_STAGE_EVENT, { detail: { stage: 'drive' } }));
}

/** Every cue this file builds is torn down, so no listener crosses a test. */
const built = [];
const gatheringGame = () => {
    const game = fakeGame(openCountry, { objective: { stage: 'roundup' } });
    built.push(game);
    return game;
};

afterEach(() => {
    for (const game of built.splice(0)) {
        try { game._gateCue?.dispose(); } catch { /* already disposed */ }
    }
});

describe('the cue follows the objective when the destination moves', () => {
    // Read out of the real scene rather than typed here: the point is that these
    // are two different places, and a spec that restates the coordinates would
    // still pass if the scene moved one of them.
    const roundup = resolveGateDescriptor(openCountry, { objective: { stage: 'roundup' } });
    const drive = resolveGateDescriptor(openCountry, { objective: { stage: 'drive' } });

    it('has two destinations far enough apart for this to matter', () => {
        expect(roundup.kind).toBe('zone');
        expect(drive.kind).toBe('portal');
        expect(Math.hypot(
            drive.position.x - roundup.position.x, drive.position.z - roundup.position.z,
        )).toBeGreaterThan(200);
    });

    it('moves the column to the new destination on the stage flip', () => {
        const game = gatheringGame();
        bindGateCue(game);
        expect(named(game.scene, COLUMN)[0].position.z).toBe(roundup.position.z);

        flipToDrive(game);

        const columns = named(game.scene, COLUMN);
        expect(columns.length, 'one flip, one column').toBe(1);
        expect(columns[0].position.z).toBe(drive.position.z);
    });

    it('rebuilds the arc at the new destination instead of leaving its vertices behind', () => {
        const game = gatheringGame();
        bindGateCue(game);
        const before = game._gateCue.arc.mesh.geometry.getAttribute('position');
        expect(before.getZ(0)).toBeGreaterThan(roundup.position.z - roundup.width);
        expect(before.getZ(0)).toBeLessThan(roundup.position.z + roundup.width);

        flipToDrive(game);

        const arcs = named(game.scene, ARC);
        expect(arcs.length).toBe(1);
        const after = arcs[0].geometry.getAttribute('position');
        for (let i = 0; i < after.count; i++) {
            expect(Math.hypot(after.getX(i) - drive.position.x, after.getZ(i) - drive.position.z))
                .toBeLessThan(drive.width);
        }
    });

    it('reaches the portal state the arc has always branched on but never drawn', () => {
        // `gateArcSweep` closes a disc's ring and sweeps only a gate's approach
        // half. Before the fix the cue could never be built in the portal state
        // in play, because a rebuild resets the objective to `roundup`.
        const game = gatheringGame();
        bindGateCue(game);
        expect(game._gateCue.descriptor.kind).toBe('zone');

        flipToDrive(game);

        expect(game._gateCue.descriptor.kind).toBe('portal');
        expect(game._gateCue.arc.sweep).toBe(gateArcSweep(drive));
        expect(game._gateCue.arc.radius).toBeCloseTo(drive.width / 2, 9);
    });

    it('disposes the surfaces it replaces rather than stacking them', () => {
        const game = gatheringGame();
        bindGateCue(game);
        const stale = game._gateCue;
        const columnGeometry = vi.spyOn(stale.column.mesh.geometry, 'dispose');
        const arcMaterial = vi.spyOn(stale.arc.material, 'dispose');

        flipToDrive(game);

        expect(game._gateCue).not.toBe(stale);
        expect(columnGeometry).toHaveBeenCalled();
        expect(arcMaterial).toHaveBeenCalled();
        expect(stale.column.mesh.parent).toBeNull();
    });

    it('holds one cue across repeated flips, so the listener cannot stack', () => {
        const game = gatheringGame();
        bindGateCue(game);
        for (let i = 0; i < 4; i++) flipToDrive(game);
        expect(named(game.scene, COLUMN).length).toBe(1);
        expect(named(game.scene, ARC).length).toBe(1);
    });

    it('leaves a scene with one fixed destination exactly where it was', () => {
        const game = fakeGame(field, { objective: null });
        built.push(game);
        bindGateCue(game);
        const home = resolveGateDescriptor(field, null);

        window.dispatchEvent(new CustomEvent(OBJECTIVE_STAGE_EVENT, { detail: { stage: 'drive' } }));

        const columns = named(game.scene, COLUMN);
        expect(columns.length).toBe(1);
        expect(columns[0].position.x).toBe(home.position.x);
        expect(columns[0].position.z).toBe(home.position.z);
    });
});

describe('the stage listener belongs to the cue that registered it', () => {
    it('is removed with the cue, so a flip after a scene swap builds nothing', async () => {
        const game = gatheringGame();
        bindGateCue(game);

        await disposeScene(game);
        expect(game._gateCue).toBeNull();

        window.dispatchEvent(new CustomEvent(OBJECTIVE_STAGE_EVENT, { detail: { stage: 'drive' } }));

        expect(game._gateCue).toBeNull();
        expect(named(game.scene, COLUMN).length).toBe(0);
        expect(named(game.scene, ARC).length).toBe(0);
    });

    it('listens to the literal both dispatch sites actually send', () => {
        // Neither dispatch site can import the constant: both are in the eagerly
        // loaded main-*.js chunk and the import would drag the whole cue graph
        // into a fenced ratchet. So the spelling is pinned here instead.
        for (const file of ['js/GameState.js', 'js/boot/initNetwork.js']) {
            expect(source(file), `${file} must dispatch the event the cue listens to`)
                .toContain(`'${OBJECTIVE_STAGE_EVENT}'`);
        }
        expect(source('js/effects/GateColumn.js')).toMatch(/OBJECTIVE_STAGE_EVENT/);
    });

    it('re-resolves through the one bind rather than polling for the stage', () => {
        // The stage is an event the game already dispatches. A per-frame read of
        // `objective.stage` inside the cue's update would rebuild geometry from
        // inside the render loop, which is how a once-a-round change becomes a
        // per-frame cost.
        const text = source('js/effects/GateColumn.js');
        expect(text).toMatch(/onStageChanged/);
        expect(text, 'the cue must not poll the objective').not.toMatch(/objective\?\.stage|objective\.stage/);
    });
});
