// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The pen-barrier resolver exists twice, and nothing used to check that the two
 * agree.
 *
 * `worker/src/GameSim.js#createScenePenBarrier` is the production one: it is
 * what stands the barrier up in a real room. `tests/sim-baseline/harness.js`
 * carries a hand copy, `makeScenePenBarrier`, documented as mirroring it
 * "exactly, including the gate resolution order" - and that copy is what
 * captured `__fixtures__/pasture-retirement-rh-60hz.json`. A sim-baseline
 * fixture is only a regression detector for as long as the thing that captured
 * it is the thing that ships, so a silent drift here does not fail a test, it
 * invalidates a trace and keeps passing.
 *
 * The copy cannot simply be deleted in favour of an import: the harness is also
 * loaded by bare-node probes under `cycle117-validation/` and `tools/`, and
 * `worker/src/GameSim.js` imports `./log` without an extension, which node
 * cannot resolve. So the mirror stays and this pins it.
 */
import { describe, it, expect } from 'vitest';

import { listScenes, loadScene } from '../shared/scenes/index.js';
import { createScenePenBarrier } from '../worker/src/GameSim.js';
import { makeScenePenBarrier, makeDeterministicFlock } from './sim-baseline/harness.js';

const SEED = 0xC117;

/**
 * Every own property of a PenBarrier. The class holds nothing but data - the
 * resolved box edges, half-extents, centre, gate slot, which edge the gate is
 * on, the body radii and the settle seed - so two barriers with the same
 * snapshot are the same barrier, method for method.
 */
const snapshot = (b) => (b === null ? null : { ...b });

const SCENE_IDS = listScenes().map((s) => s.id);

describe('the harness mirror of createScenePenBarrier does not drift', () => {
    it('covers every registered scene, so a new one cannot slip past this', () => {
        expect([...SCENE_IDS].sort()).toEqual(
            ['field', 'newsheepdogland', 'open-country', 'rolling-hills'],
        );
    });

    it('resolves the same barrier, or the same null, on every scene', () => {
        for (const id of SCENE_IDS) {
            const worker = createScenePenBarrier(loadScene(id), SEED);
            const harness = makeScenePenBarrier(id, SEED);
            expect(snapshot(harness), `${id}: harness mirror`).toEqual(snapshot(worker));
        }
    });

    it('agrees on WHICH scenes get a barrier at all', () => {
        // Stated as a list rather than derived, because "both returned null" is
        // the failure mode that looks like agreement. Rolling Hills' gate is
        // nested, Newsheepdogland's is top-level; Home Field and Open Country
        // declare no pen.
        const withBarrier = SCENE_IDS
            .filter((id) => createScenePenBarrier(loadScene(id), SEED) !== null)
            .sort();
        expect(withBarrier).toEqual(['newsheepdogland', 'rolling-hills']);
        for (const id of ['field', 'open-country']) {
            expect(makeScenePenBarrier(id, SEED), `${id} has no pen`).toBeNull();
        }
    });

    it('picks the NESTED gate over a top-level one, in both copies', () => {
        // The documented contract is `pen.gate ?? scene.gate`, IN THAT ORDER,
        // and no shipped scene declares both - so nothing else in the suite can
        // tell the two orders apart. Declare both on the real scene object the
        // registry hands out (there is no seam to pass a scene into
        // `makeScenePenBarrier`, which resolves by id), and put it back after.
        const rollingHills = loadScene('rolling-hills');
        const decoy = { position: { x: -70, z: 70 }, width: 30 };
        expect('gate' in rollingHills, 'the island declares no top-level gate').toBe(false);
        let worker;
        let harness;
        try {
            rollingHills.gate = decoy;
            worker = createScenePenBarrier(rollingHills, SEED);
            harness = makeScenePenBarrier('rolling-hills', SEED);
        } finally {
            delete rollingHills.gate;
        }
        expect(rollingHills.gate).toBeUndefined();

        const nested = rollingHills.pen.gate;
        for (const [label, barrier] of [['worker', worker], ['harness', harness]]) {
            expect(barrier.gateX, `${label} resolved the nested gate x`).toBe(nested.position.x);
            expect(barrier.gateZ, `${label} resolved the nested gate z`).toBe(nested.position.z);
            expect(barrier.gateHalf, `${label} resolved the nested gate width`)
                .toBe(nested.width / 2);
        }
        expect(snapshot(harness)).toEqual(snapshot(worker));
    });

    it('falls back to the top-level gate when the pen nests none, in both copies', () => {
        // Newsheepdogland is the live case for the fallback half of the order:
        // a nested-only resolver would drop its homestead barrier entirely.
        const nsl = loadScene('newsheepdogland');
        expect(nsl.pen.gate, 'the homestead pen nests no gate').toBeUndefined();
        const worker = createScenePenBarrier(nsl, SEED);
        const harness = makeScenePenBarrier('newsheepdogland', SEED);
        expect(worker).not.toBeNull();
        expect(worker.gateX).toBe(nsl.gate.position.x);
        expect(worker.gateZ).toBe(nsl.gate.position.z);
        expect(snapshot(harness)).toEqual(snapshot(worker));
    });

    it('retires an identical flock through both, position for position', () => {
        // Field equality is sufficient in principle (the class is pure data),
        // but the claim the fixture rests on is behavioural, so make it
        // behavioural: run the same flock through both barriers and compare the
        // corrected positions, including the seeded settle spot.
        const pen = loadScene('rolling-hills').pen;
        // The same flock builder the fixture uses, laid across the gate edge so
        // the run exercises entry, the settle walk and the keep-out push.
        const flock = () => makeDeterministicFlock(12, pen.minX + 6, pen.maxZ - 12, 3.0);

        const a = flock();
        const b = flock();
        const workerPen = createScenePenBarrier(loadScene('rolling-hills'), SEED);
        const harnessPen = makeScenePenBarrier('rolling-hills', SEED);
        for (let t = 0; t < 30; t++) {
            workerPen.update(a, null, true, 1 / 60);
            harnessPen.update(b, null, true, 1 / 60);
        }

        expect(harnessPen.pennedCount).toBe(workerPen.pennedCount);
        expect(workerPen.pennedCount).toBeGreaterThan(0);
        expect(b.map((s) => [s.position.x, s.position.z, s.state, s.penned ?? false]))
            .toEqual(a.map((s) => [s.position.x, s.position.z, s.state, s.penned ?? false]));
    });
});
