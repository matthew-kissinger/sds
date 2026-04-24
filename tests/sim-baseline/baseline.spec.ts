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
    tickSheepCoop,
    tickSheepdog,
    tickSheepdogClientInterp,
    applyInput,
    round4
} from './harness.js';

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
});
