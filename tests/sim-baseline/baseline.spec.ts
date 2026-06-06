// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * 60Hz simulation reference traces.
 *
 * Background: cycle-1-audit.md "Significant" #1 flagged that Cycle 1 dropped
 * server tick rate from 60Hz to 20Hz with no playtest. Per-tick deltas tripled;
 * rotation smoothing and client-reconciliation interpolation factors jumped 3x
 * (from 0.133 to 0.4). These traces capture the current 60Hz behavior so the
 * Cycle-2 retry can assert its 20Hz port stays close to the same continuous
 * behavior when sampled at the same wall-clock times.
 *
 * Four traces are captured:
 *   1. sheep-60hz-20s.json      - flock of 20 sheep fleeing a stationary dog
 *   2. dog-rotation-60hz.json   - dog commanded to rotate from 0 to -pi/2 target
 *   3. stamina-curve-60hz.json  - 3s sprint + 3s rest stamina trajectory
 *   4. reconcile-interp-60hz.json - clientPosition reconciliation factors
 *
 * Running these as regression tests: vitest asserts the recorded JSON matches
 * what the harness produces today. Regenerate with UPDATE_FIXTURES=true.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error - harness is plain JS, no types
import {
    makeDeterministicFlock,
    makeSheepdog,
    makeCoopGameState,
    makeIslandGameState,
    makeIslandSheepConfig,
    tickSheepCoop,
    tickSheepIslandCoop,
    tickSheepdog,
    tickSheepdogClientInterp,
    applyInput,
    withSeededRandom,
    round4
} from './harness.js';
// @ts-expect-error - shared module, no types
import { loadScene, createObjective, tickObjective, isCorralOpen, applyBarkImpulse, DEFAULT_BARK_CONFIG } from '../../shared/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '__fixtures__');
const UPDATE = process.env.UPDATE_FIXTURES === 'true';

function loadOrWriteFixture(name: string, data: unknown): unknown {
    const path = resolve(FIXTURES_DIR, name);
    if (UPDATE || !existsSync(path)) {
        if (!existsSync(FIXTURES_DIR)) mkdirSync(FIXTURES_DIR, { recursive: true });
        writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
        return data;
    }
    return JSON.parse(readFileSync(path, 'utf8'));
}

describe('60Hz simulation baseline', () => {
    const TICK_RATE = 60;
    const DT = 1 / TICK_RATE;

    it('sheep trace: 20 sheep, 60 ticks, single stationary dog', () => {
        // Deterministic flock (no PRNG). Dog placed slightly east of flock so
        // its flee field pushes the flock westward - generates interesting
        // motion without needing random jitter.
        const sheep = makeDeterministicFlock(20, -20, -20, 1.5);
        const dog = makeSheepdog('p1', -15, -20);
        const state = makeCoopGameState();

        const trace: Array<{
            tick: number;
            sheep: Array<{ id: number; x: number; z: number; state: number }>;
        }> = [];

        // Record the initial state (tick 0) then step 60 ticks (1s at 60Hz).
        trace.push({
            tick: 0,
            sheep: sheep.map(s => ({
                id: s.id,
                x: round4(s.position.x),
                z: round4(s.position.z),
                state: s.state
            }))
        });

        for (let t = 1; t <= 60; t++) {
            tickSheepCoop(sheep, [dog], state, DT);
            trace.push({
                tick: t,
                sheep: sheep.map(s => ({
                    id: s.id,
                    x: round4(s.position.x),
                    z: round4(s.position.z),
                    state: s.state
                }))
            });
        }

        const expected = loadOrWriteFixture('sheep-60hz-20s.json', trace) as typeof trace;

        // Sanity checks first - cheap, easy to debug.
        expect(trace).toHaveLength(61);
        expect(trace[0].sheep).toHaveLength(20);

        // Snapshot match against committed fixture.
        expect(trace).toEqual(expected);
    });

    it('dog rotation: from 0 to target, record per-tick until convergence', () => {
        const dog = makeSheepdog('p1', 0, 0);
        const state = makeCoopGameState();

        // Drive the dog with velocity pointing along +X so targetRotation
        // settles to -0 + pi/2 = pi/2. We feed constant input and record the
        // dog.rotation each tick until within 0.01 rad (or 180 ticks = 3s).
        const input = {
            direction: { x: 1, z: 0 },
            sprint: false,
            inputSequence: 0,
            clientPosition: null
        };

        const trace: Array<{
            tick: number;
            rotation: number;
            targetRotation: number;
            converged: boolean;
        }> = [];

        const TARGET_TOL = 0.01;
        const MAX_TICKS = 180;
        let converged = false;

        trace.push({ tick: 0, rotation: round4(dog.rotation), targetRotation: round4(dog.targetRotation), converged: false });

        for (let t = 1; t <= MAX_TICKS; t++) {
            const tickInput = { ...input, inputSequence: t };
            tickSheepdog(dog, state, DT, tickInput);

            const diff = Math.abs(dog.targetRotation - dog.rotation);
            converged = diff < TARGET_TOL;

            trace.push({
                tick: t,
                rotation: round4(dog.rotation),
                targetRotation: round4(dog.targetRotation),
                converged
            });
            if (converged) break;
        }

        const expected = loadOrWriteFixture('dog-rotation-60hz.json', trace) as typeof trace;

        // Sanity: it must have converged within the budget. If not, something
        // is wrong with the rotation math - don't let the test silently pass
        // with a runaway trace.
        expect(converged).toBe(true);
        expect(trace[trace.length - 1].converged).toBe(true);

        expect(trace).toEqual(expected);
    });

    it('stamina curve: 3s sprint, 3s rest, recorded every tick', () => {
        const dog = makeSheepdog('p1', 0, 0);
        const state = makeCoopGameState();

        const trace: Array<{ tick: number; stamina: number; isSprinting: boolean }> = [];
        trace.push({ tick: 0, stamina: round4(dog.stamina), isSprinting: dog.isSprinting });

        // Phase 1: 3 seconds of sprint (180 ticks).
        for (let t = 1; t <= 180; t++) {
            tickSheepdog(dog, state, DT, {
                direction: { x: 1, z: 0 },
                sprint: true,
                inputSequence: t,
                clientPosition: null
            });
            trace.push({ tick: t, stamina: round4(dog.stamina), isSprinting: dog.isSprinting });
        }

        // Phase 2: 3 seconds of rest (no movement, no sprint).
        for (let t = 181; t <= 360; t++) {
            tickSheepdog(dog, state, DT, {
                direction: { x: 0, z: 0 },
                sprint: false,
                inputSequence: t,
                clientPosition: null
            });
            trace.push({ tick: t, stamina: round4(dog.stamina), isSprinting: dog.isSprinting });
        }

        const expected = loadOrWriteFixture('stamina-curve-60hz.json', trace) as typeof trace;

        // Sanity: stamina should drain under sprint, bounded [0, 100].
        const minStamina = Math.min(...trace.map(s => s.stamina));
        const maxStamina = Math.max(...trace.map(s => s.stamina));
        expect(minStamina).toBeGreaterThanOrEqual(0);
        expect(maxStamina).toBeLessThanOrEqual(100);
        // Rest phase must end well above sprint-end stamina (recovered).
        expect(trace[360].stamina).toBeGreaterThan(trace[180].stamina);

        expect(trace).toEqual(expected);
    });

    it('client reconciliation: server interpolates dog toward clientPosition', () => {
        // Setup: server has dog at (0, 0); client reports it's at (1.5, 1.0)
        // with zero movement input. Server should start interpolating. Record
        // the per-tick factor and current server-authoritative position.
        const dog = makeSheepdog('p1', 0, 0);

        // Fire the "stop at clientPosition" input. After this, the dog enters
        // isInterpolatingToClient=true and subsequent tickSheepdog calls would
        // take the interp branch. We call the interp branch directly instead
        // of routing through tickSheepdog so the trace is unambiguous.
        applyInput(dog, {
            direction: { x: 0, z: 0 },
            sprint: false,
            inputSequence: 1,
            clientPosition: { x: 1.5, z: 1.0 }
        }, DT);

        expect(dog.isInterpolatingToClient).toBe(true);

        const trace: Array<{
            tick: number;
            x: number;
            z: number;
            distance: number;
            factor: number;
            stillInterpolating: boolean;
        }> = [];

        trace.push({
            tick: 0,
            x: round4(dog.position.x),
            z: round4(dog.position.z),
            distance: round4(Math.sqrt(1.5 * 1.5 + 1 * 1)),
            factor: 0,
            stillInterpolating: dog.isInterpolatingToClient
        });

        // Up to 120 ticks (2s) - convergence at 8*DT=0.1333 per tick is fast.
        for (let t = 1; t <= 120; t++) {
            const { factor, distance } = tickSheepdogClientInterp(dog, DT);
            trace.push({
                tick: t,
                x: round4(dog.position.x),
                z: round4(dog.position.z),
                distance: round4(distance),
                factor: round4(factor),
                stillInterpolating: dog.isInterpolatingToClient
            });
            if (!dog.isInterpolatingToClient) break;
        }

        const expected = loadOrWriteFixture('reconcile-interp-60hz.json', trace) as typeof trace;

        // Sanity: interpolation factor at 60Hz is min(8*1/60, 0.8) = 0.1333...
        // Convergence is expected well within 120 ticks.
        expect(dog.isInterpolatingToClient).toBe(false);
        expect(trace[1].factor).toBeCloseTo(0.1333, 3);

        expect(trace).toEqual(expected);
    });

    // Cycle 34 Phase 1: island-scene baselines. Net-additive coverage for
    // calculateIslandAvoidance + updateSheepCorralRetirements + the OC
    // perceptionRadius=9 override. Pre-existing fixtures untouched.

    it('island boundary RH: 50 sheep in falloff zone drift inward', () => {
        // Rolling Hills: boundary.radius=180, falloff=40 → safeRadius=140.
        // Cluster at (150, 0) is 10m into the falloff zone, so every sheep
        // feels an inward steer force. Dog placed at (-50, -50) outside the
        // 8m fleeRadius so flocking + boundary forces dominate.
        const sheep = makeDeterministicFlock(50, 150, 0, 1.5);
        const dog = makeSheepdog('p1', -50, -50);
        const state = makeIslandGameState('rolling-hills', 50);
        const config = makeIslandSheepConfig('rolling-hills');

        const trace: Array<{
            tick: number;
            sheep: Array<{ id: number; x: number; z: number; state: number }>;
        }> = [];

        trace.push({
            tick: 0,
            sheep: sheep.map(s => ({
                id: s.id,
                x: round4(s.position.x),
                z: round4(s.position.z),
                state: s.state
            }))
        });

        for (let t = 1; t <= 60; t++) {
            tickSheepIslandCoop(sheep, [dog], state, DT, config);
            trace.push({
                tick: t,
                sheep: sheep.map(s => ({
                    id: s.id,
                    x: round4(s.position.x),
                    z: round4(s.position.z),
                    state: s.state
                }))
            });
        }

        const expected = loadOrWriteFixture('island-boundary-rh-60hz.json', trace) as typeof trace;

        expect(trace).toHaveLength(61);
        expect(trace[0].sheep).toHaveLength(50);
        // Sanity: the cluster mean-x should drift inward (toward 0) over 60
        // ticks. Anything else means the island avoidance is broken.
        const meanXStart = trace[0].sheep.reduce((a, s) => a + s.x, 0) / 50;
        const meanXEnd = trace[60].sheep.reduce((a, s) => a + s.x, 0) / 50;
        expect(meanXEnd).toBeLessThan(meanXStart);

        expect(trace).toEqual(expected);
    });

    it('corral retirement RH: 30 sheep adjacent to corral retire over 120 ticks', () => {
        // Rolling Hills corral: (110, 60) radius 8. Cluster at (114, 60)
        // straddles the corral disc — some sheep start inside and retire
        // immediately, others drift in via flocking + flee from the dog.
        // Dog at (122, 60), east of cluster, pushes flock west into corral.
        // updateSheepCorralRetirements uses Math.random() for the retirement
        // target inside the corral disc — wrap in withSeededRandom for a
        // reproducible trace.
        const seed = 0xC34F1E12;
        const result = withSeededRandom(seed, () => {
            const sheep = makeDeterministicFlock(30, 114, 60, 1.0);
            const dog = makeSheepdog('p1', 122, 60);
            const state = makeIslandGameState('rolling-hills', 30);
            const config = makeIslandSheepConfig('rolling-hills');

            const trace: Array<{
                tick: number;
                retired: number;
                inCorral: number;
                sample: Array<{ id: number; x: number; z: number; state: number; retired: boolean }>;
            }> = [];

            const sampleIds = [0, 5, 10, 15, 20, 25, 29];
            const cx = state.corral.center.x;
            const cz = state.corral.center.z;
            const rSq = state.corral.radius * state.corral.radius;

            const snap = (tick: number) => {
                let retired = 0;
                let inCorral = 0;
                for (const s of sheep) {
                    if (s.hasPassedGate || s.isRetiring) retired++;
                    const dx = s.position.x - cx;
                    const dz = s.position.z - cz;
                    if (dx * dx + dz * dz <= rSq) inCorral++;
                }
                trace.push({
                    tick,
                    retired,
                    inCorral,
                    sample: sampleIds.map(id => {
                        const s = sheep[id];
                        return {
                            id,
                            x: round4(s.position.x),
                            z: round4(s.position.z),
                            state: s.state,
                            retired: !!(s.hasPassedGate || s.isRetiring)
                        };
                    })
                });
            };

            snap(0);
            for (let t = 1; t <= 120; t++) {
                tickSheepIslandCoop(sheep, [dog], state, DT, config);
                snap(t);
            }
            return trace;
        });

        const expected = loadOrWriteFixture('corral-retirement-rh-60hz.json', result) as typeof result;

        expect(result).toHaveLength(121);
        // Sanity: retired count must be monotonically non-decreasing.
        for (let i = 1; i < result.length; i++) {
            expect(result[i].retired).toBeGreaterThanOrEqual(result[i - 1].retired);
        }
        // Sanity: at least one sheep must retire by end of trace.
        expect(result[result.length - 1].retired).toBeGreaterThan(0);

        expect(result).toEqual(expected);
    });

    it('OC objective stage: roundup → drive after holdRequired with sheep in zone', () => {
        // Open Country: objective.roundupZone (0, 50, r=30), holdRequired=2.0s.
        // 50 sheep clustered at (0, 50) all start inside the zone. With 50
        // total, requiredSheep = max(10, floor(50*0.40)) = 20. Count stays
        // at 50 (well above 20) so holdTimer accumulates linearly until
        // the stage flips at tick 120 (2.0s at 60Hz).
        const scene = loadScene('open-country');
        const objective = createObjective(scene.objective, 50);
        const sheep = makeDeterministicFlock(50, 0, 50, 1.5);

        const trace: Array<{
            tick: number;
            stage: string;
            sheepInZone: number;
            holdTimer: number;
            corralOpen: boolean;
        }> = [];

        const snap = (tick: number) => {
            trace.push({
                tick,
                stage: objective.stage,
                sheepInZone: objective.sheepInZone,
                holdTimer: round4(objective.holdTimer),
                corralOpen: isCorralOpen(objective)
            });
        };

        snap(0);
        // Run 130 ticks. 120 = 2.0s holdRequired. Stage should flip at
        // tick 120 (or 121 depending on >= comparison). Sample beyond to
        // confirm 'drive' stays sticky.
        for (let t = 1; t <= 130; t++) {
            tickObjective(objective, sheep, DT, null);
            snap(t);
        }

        const expected = loadOrWriteFixture('oc-objective-stage-60hz.json', trace) as typeof trace;

        // Sanity: requiredSheep formula applied (max(10, floor(50*0.40))=20).
        expect(objective.requiredSheep).toBe(20);
        // Sanity: starts in roundup, ends in drive.
        expect(trace[0].stage).toBe('roundup');
        expect(trace[trace.length - 1].stage).toBe('drive');
        // Sanity: stage transitions exactly once (no flapping).
        const flips = trace.filter((row, i) => i > 0 && row.stage !== trace[i - 1].stage);
        expect(flips).toHaveLength(1);
        expect(flips[0].stage).toBe('drive');
        // Sanity: corralOpen tracks the stage flip.
        expect(trace[0].corralOpen).toBe(false);
        expect(trace[trace.length - 1].corralOpen).toBe(true);

        expect(trace).toEqual(expected);
    });

    it('island boundary OC: 50 sheep in falloff zone with perceptionRadius=9 override', () => {
        // Open Country: boundary.radius=380, falloff=70 → safeRadius=310.
        // Cluster at (350, 0) is 40m into the falloff zone. Dog far enough
        // away to not engage flee. Verifies the bigger-island avoidance
        // path AND the scene's flocking.perceptionRadius=9 override (vs
        // the multiplayer default of 6).
        const sheep = makeDeterministicFlock(50, 350, 0, 1.5);
        const dog = makeSheepdog('p1', -200, -200);
        const state = makeIslandGameState('open-country', 50);
        const config = makeIslandSheepConfig('open-country');

        // Sanity: confirm OC's perception override survived merge.
        expect(config.perceptionRadius).toBe(9);

        const trace: Array<{
            tick: number;
            sheep: Array<{ id: number; x: number; z: number; state: number }>;
        }> = [];

        trace.push({
            tick: 0,
            sheep: sheep.map(s => ({
                id: s.id,
                x: round4(s.position.x),
                z: round4(s.position.z),
                state: s.state
            }))
        });

        for (let t = 1; t <= 60; t++) {
            tickSheepIslandCoop(sheep, [dog], state, DT, config);
            trace.push({
                tick: t,
                sheep: sheep.map(s => ({
                    id: s.id,
                    x: round4(s.position.x),
                    z: round4(s.position.z),
                    state: s.state
                }))
            });
        }

        const expected = loadOrWriteFixture('island-boundary-oc-60hz.json', trace) as typeof trace;

        expect(trace).toHaveLength(61);
        const meanXStart = trace[0].sheep.reduce((a, s) => a + s.x, 0) / 50;
        const meanXEnd = trace[60].sheep.reduce((a, s) => a + s.x, 0) / 50;
        expect(meanXEnd).toBeLessThan(meanXStart);

        expect(trace).toEqual(expected);
    });

    // Cycle 61 Phase 4: deterministic bark impulse trace. New fixture
    // (bark-impulse-60hz.json), recorded here as intended NEW behavior. The
    // no-bark fixtures above are untouched - applyBarkImpulse is only ever
    // called on a fired bark, so they regenerate byte-identical. This trace
    // pins the bark cone/range/falloff math and its interaction with the
    // flee/flock integration over 15 ticks.
    it('bark impulse: a fired bark drives the in-cone flock forward', () => {
        // Dog at origin facing +z. A 5x5 cluster centered ahead at (0, 5): near
        // rows sit inside the 12m range and the 50-degree forward cone, the wide
        // corners fall outside the cone. Bark fires once at tick 5.
        const sheep = makeDeterministicFlock(25, 0, 5, 1.5);
        const dog = makeSheepdog('p1', 0, 0);
        const state = makeCoopGameState();
        const forward = { x: 0, z: 1 };
        const BARK_TICK = 5;

        const snapshot = () => sheep.map(s => ({
            id: s.id,
            x: round4(s.position.x),
            z: round4(s.position.z),
            vx: round4(s.velocity.x),
            vz: round4(s.velocity.z)
        }));

        const trace: Array<{ tick: number; pushed: number; sheep: ReturnType<typeof snapshot> }> = [
            { tick: 0, pushed: 0, sheep: snapshot() }
        ];

        for (let t = 1; t <= 15; t++) {
            let pushed = 0;
            if (t === BARK_TICK) {
                pushed = applyBarkImpulse(sheep, dog.position, forward, DEFAULT_BARK_CONFIG);
            }
            tickSheepCoop(sheep, [dog], state, DT);
            trace.push({ tick: t, pushed, sheep: snapshot() });
        }

        const expected = loadOrWriteFixture('bark-impulse-60hz.json', trace) as typeof trace;

        expect(trace).toHaveLength(16);
        // Sanity: the bark reached part of the flock but not all of it (the wide
        // corners are outside the cone).
        const barkRow = trace[BARK_TICK];
        expect(barkRow.pushed).toBeGreaterThan(0);
        expect(barkRow.pushed).toBeLessThan(25);

        expect(trace).toEqual(expected);
    });
});
