// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P-DET-1 (option c) — harness-vs-GameSim parity + per-game-seed determinism.
 *
 * Two concerns, one file:
 *
 * 1. HARNESS PARITY (the coverage keystone). The sim-baseline fixtures are
 *    produced by harness.js routines that *mirror* GameSim.updateSheep by hand.
 *    The README's "Harness drift" note flags that nothing automatically checks
 *    the mirror stays faithful: if GameSim or shared/ changes, the harness can
 *    silently diverge and the fixtures would just re-bake against the drifted
 *    harness. This spec closes that gap by driving a *real* GameSimulation
 *    (via the makeRoomAdapter pattern from worker-objective-snapshot.spec.js)
 *    over a deterministic grid flock + a stationary dog, and asserting the
 *    per-tick MOVEMENT integration is bit-identical (round4) to running the
 *    harness's tickSheepCoop over the same starting state. This is the rng-free
 *    hot path, so it validates harness fidelity *independent of* seeding.
 *
 * 2. SPAWN DETERMINISM. The P-DET-1 plumbing draws a per-game seed once at
 *    GameSimulation construction (server-side, never on the wire) and threads a
 *    mulberry32(seed) into the five shared spawn/retirement functions. Two sims
 *    built with the SAME seed must produce identical initial sheep positions;
 *    DIFFERENT seeds must differ (that's the per-game variety source).
 *
 * Scope note: harness parity is asserted over the cooperative field scene's
 * MOVEMENT integration — the path tickSheepCoop mirrors. The flock is parked in
 * the interior with a stationary dog, so no sheep reaches the gate and the
 * rng-using retirement bookkeeping never fires (zero draws, zero state change).
 * That is exactly the rng-free surface we want to pin. Retirement *placement*
 * reproducibility is covered by concern (2) + the existing corral fixture.
 */

import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../../worker/src/GameSim.js';
// @ts-expect-error - harness is plain JS, no types
import {
    makeDeterministicFlock,
    makeSheepdog,
    makeCoopGameState,
    tickSheepCoop,
    round4
} from './harness.js';

/**
 * Adapter mirroring worker-objective-snapshot.spec.js. `seed` is optional: when
 * omitted, GameSim falls back to its own in-memory draw (still deterministic
 * per-instance, just not reproducible across instances). When provided, the sim
 * seeds its mulberry32 from it — that's the RoomDO-persisted path in production.
 */
function makeRoomAdapter(sceneId: string, sheepCount = 50, seed?: number) {
    return {
        roomCode: 'TESTRM',
        isPublic: false,
        modeLocked: false,
        gameMode: 'cooperative',
        sceneId,
        sheepCount,
        ...(typeof seed === 'number' ? { seed } : {}),
        state: 'waiting',
        lastActivity: Date.now(),
        simulation: null,
        players: new Map([['p1', { id: 'p1', name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() }]]),
        getPlayer: (id: string) => ({ id, name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() }),
        broadcastToRoom: () => {},
        finishGame: () => {},
        getSerializableState: () => ({}),
        resolvePlayerName: () => 'A',
        onSubmitScores: async () => {}
    };
}

function tickFrames(sim: any, frameCount: number) {
    sim.isRunning = true;
    try {
        for (let i = 0; i < frameCount; i++) sim.tick();
    } finally {
        sim.isRunning = false;
    }
}

function snapshotPositions(sheep: any[]) {
    return sheep.map((s: any) => ({
        id: s.id,
        x: round4(s.position.x),
        z: round4(s.position.z)
    }));
}

describe('P-DET-1: harness ↔ GameSimulation movement parity', () => {
    const TICK_RATE = 60;
    const DT = 1 / TICK_RATE;

    it('GameSim.updateSheep movement integration is bit-identical to harness tickSheepCoop (field coop, stationary dog)', () => {
        // Field scene, cooperative. GameSim builds its sheepConfig as
        // {maxSpeed:0.24, maxForce:0.05, perceptionRadius:6, separationDistance:2.5}
        // merged with scene.flocking — Field declares no flocking override, so it
        // matches harness SHEEP_CONFIG exactly. That equality is load-bearing for
        // this comparison; assert it transitively via the bit-identical result.
        const sim = new GameSimulation(makeRoomAdapter('field', 20));
        try {
            // Overwrite the sim's RNG-seeded spawn with a deterministic grid so
            // both sides start from byte-identical state. Same layout the
            // sheep-60hz-20s.json baseline uses: 20 sheep at (-20,-20), dog at
            // (-15,-20) just east of the flock so its flee field is non-trivial.
            const simSheep = makeDeterministicFlock(20, -20, -20, 1.5);
            sim.gameState.sheep = simSheep;

            // Park the single dog stationary at the baseline position. A
            // zero-velocity, zero-accel dog does not move under updateSheepdogs
            // (smoothed velocity stays below the 0.1 threshold), so its position
            // is the same fixed point every tick — identical flee input to both.
            const dog = sim.sheepdogs.get('p1');
            dog.position.set(-15, -20);
            dog.velocity.set(0, 0);
            dog.acceleration.set(0, 0);
            dog.isInterpolatingToClient = false;
            dog.clientStopTarget = null;

            // Harness side: identical starting flock + a fixed dog point + the
            // field coop game state (gated pasture). tickSheepCoop reads only
            // dog.position for flee, so a plain stationary dog object suffices.
            const harnessSheep = makeDeterministicFlock(20, -20, -20, 1.5);
            const harnessDog = makeSheepdog('p1', -15, -20);
            const harnessState = makeCoopGameState();

            // Step both 60 ticks (1s at 60Hz) and compare positions each tick.
            for (let t = 1; t <= 60; t++) {
                tickFrames(sim, 1);
                tickSheepCoop(harnessSheep, [harnessDog], harnessState, DT);

                const simPos = snapshotPositions(sim.gameState.sheep);
                const harnessPos = snapshotPositions(harnessSheep);
                expect(simPos, `tick ${t}: sim vs harness sheep positions`).toEqual(harnessPos);
            }

            // Sanity: the dog really stayed put (the comparison's key premise).
            expect(round4(dog.position.x)).toBe(-15);
            expect(round4(dog.position.z)).toBe(-20);

            // Sanity: no sheep retired (rng-free path was the only thing tested).
            expect(sim.gameState.sheepRetired).toBe(0);
            for (const s of sim.gameState.sheep) {
                expect(s.hasPassedGate).toBe(false);
                expect(s.isRetiring).toBe(false);
            }
        } finally {
            sim.cleanup?.();
        }
    });
});

describe('P-DET-1: per-game seed spawn determinism', () => {
    it('two GameSimulations with the SAME seed produce identical initial sheep positions', () => {
        const seed = 0x5EED1234;
        const a = new GameSimulation(makeRoomAdapter('field', 200, seed));
        const b = new GameSimulation(makeRoomAdapter('field', 200, seed));
        try {
            // The seed reached the sim (not the in-memory fallback).
            expect(a.seed).toBe(seed >>> 0);
            expect(b.seed).toBe(seed >>> 0);

            const posA = snapshotPositions(a.gameState.sheep);
            const posB = snapshotPositions(b.gameState.sheep);
            expect(posA).toHaveLength(200);
            expect(posA).toEqual(posB);
        } finally {
            a.cleanup?.();
            b.cleanup?.();
        }
    });

    it('DIFFERENT seeds produce a different initial layout (per-game variety)', () => {
        const a = new GameSimulation(makeRoomAdapter('field', 200, 0x11111111));
        const b = new GameSimulation(makeRoomAdapter('field', 200, 0x22222222));
        try {
            const posA = snapshotPositions(a.gameState.sheep);
            const posB = snapshotPositions(b.gameState.sheep);
            expect(posA).toHaveLength(200);
            expect(posB).toHaveLength(200);
            // Layouts must differ. Not every sheep need move, but the flock as a
            // whole must — assert at least one position differs.
            expect(posA).not.toEqual(posB);
        } finally {
            a.cleanup?.();
            b.cleanup?.();
        }
    });

    it('an absent seed falls back to a fresh in-memory draw (still a valid uint32)', () => {
        const sim = new GameSimulation(makeRoomAdapter('field', 50));
        try {
            // No seed supplied by the adapter → GameSim drew its own.
            expect(typeof sim.seed).toBe('number');
            expect(Number.isInteger(sim.seed)).toBe(true);
            expect(sim.seed).toBeGreaterThanOrEqual(0);
            expect(sim.seed).toBeLessThanOrEqual(0xFFFFFFFF);
        } finally {
            sim.cleanup?.();
        }
    });

    it('the per-game seed never leaks into the broadcast snapshot', () => {
        const seed = 0xABCDEF01;
        const sim = new GameSimulation(makeRoomAdapter('field', 50, seed));
        try {
            const snap: any = sim.createGameStateSnapshot();
            // Top-level must not carry the seed under any plausible key.
            expect(snap).not.toHaveProperty('seed');
            expect(snap).not.toHaveProperty('rng');
            // And it must not appear nested anywhere in the serialized payload.
            expect(JSON.stringify(snap)).not.toContain(String(seed));
            expect(JSON.stringify(snap).toLowerCase()).not.toContain('"seed"');
        } finally {
            sim.cleanup?.();
        }
    });
});
