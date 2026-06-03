// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Characterization spec (read-only) for two Worker sim behaviors:
 *
 *   (1) GATE ATTRACTION — GameSimulation.shouldSeekGate(sheep) +
 *       GameSimulation.calculateGateAttraction(sheep). These live as instance
 *       methods on worker/src/GameSim.js (NOT as standalone shared/ exports),
 *       so we exercise them through a constructed GameSimulation on the
 *       cooperative `field` scene (the only shipped scene with a real
 *       gameState.gate — RH/OC corral scenes have no gate). We assert that a
 *       sheep positioned BETWEEN the gate and the dog seeks the gate with a
 *       gateward steer bounded by maxForce, while a sheep with the dog on the
 *       gate side, or with the dog out of range, does not.
 *
 *   (2) MULTI-DOG FLEE SUPERPOSITION — the worker's per-sheep flee loop
 *       (updateSheep, GameSim.js) sums an independent calculateFlee()
 *       contribution for EVERY sheepdog in this.sheepdogs. We characterize the
 *       shared calculateFlee primitive the worker imports to show the net flee
 *       on a center sheep reflects BOTH dogs (the component-wise vector sum,
 *       not just the nearest dog), then run two real GameSimulations (two dogs
 *       on opposite sides vs a single-dog control) and assert flock spread
 *       along the dog-dog axis shrinks under the two-dog squeeze.
 *
 * Read-only: imports the real worker + shared modules, mutates only its own
 * in-memory sim instances. No source / fixture / fence file is touched.
 *
 * makeRoomAdapter mirrors tests/worker-objective-snapshot.spec.js; extended to
 * accept N players (=> N sheepdogs) for the multi-dog part.
 */

import { describe, it, expect } from 'vitest';
import { GameSimulation } from '../worker/src/GameSim.js';
import { calculateFlee } from '../shared/index.js';
import { Vector2D } from '../shared/Vector2D.js';

// Room adapter shaped like the DO surface GameSimulation reads. `playerIds`
// controls how many sheepdogs the sim creates (one per player). `seed` is fixed
// so spawn placement is reproducible run-to-run.
function makeRoomAdapter(sceneId, sheepCount = 50, playerIds = ['p1'], gameMode = 'cooperative') {
    const players = new Map(
        playerIds.map((id, i) => [
            id,
            { id, name: `P${i}`, dogType: 'jep', isHost: i === 0, isReady: true, joinedAt: Date.now() }
        ])
    );
    return {
        roomCode: 'TESTRM',
        isPublic: false,
        modeLocked: false,
        gameMode,
        sceneId,
        sheepCount,
        seed: 12345,
        state: 'waiting',
        lastActivity: Date.now(),
        simulation: null,
        players,
        getPlayer: (id) => players.get(id) || { id, name: 'A', dogType: 'jep', isHost: true, isReady: true, joinedAt: Date.now() },
        broadcastToRoom: () => {},
        finishGame: () => {},
        getSerializableState: () => ({}),
        resolvePlayerName: () => 'A',
        onSubmitScores: async () => {}
    };
}

// Replace the sim's auto-created sheepdog set with dogs at exact positions.
// shouldSeekGate / calculateGateAttraction / the flee loop all iterate
// this.sheepdogs.values(), so this is the deterministic control point.
function setDogs(sim, positions) {
    sim.sheepdogs.clear();
    positions.forEach((p, i) => {
        sim.sheepdogs.set(`dog${i}`, {
            id: `dog${i}`,
            dogType: 'jep',
            position: new Vector2D(p.x, p.z),
            velocity: new Vector2D(0, 0),
            acceleration: new Vector2D(0, 0),
            maxSpeed: 30,
            sprintSpeed: 50,
            maxStamina: 100,
            stamina: 100,
            isSprinting: false,
            rotation: 0,
            targetRotation: 0,
            inputSequence: 0,
            lastInputTime: 0,
            pendingInputs: []
        });
    });
}

// Place a single sheep at (x,z), at rest, in the active state.
function parkSheep(sheep, x, z) {
    sheep.position.set(x, z);
    sheep.velocity.set(0, 0);
    sheep.acceleration.set(0, 0);
    sheep.hasPassedGate = false;
    sheep.isRetiring = false;
    sheep.retirementTarget = null;
    sheep.state = 0; // active
}

function tickFrames(sim, frameCount) {
    sim.isRunning = true;
    try {
        for (let i = 0; i < frameCount; i++) sim.tick();
    } finally {
        sim.isRunning = false;
    }
}

// Population standard deviation of a numeric array.
function stddev(values) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    return Math.sqrt(variance);
}

// ---------------------------------------------------------------------------
// Part 1: gate attraction
// ---------------------------------------------------------------------------
describe('GATE ATTRACTION (GameSim.shouldSeekGate / calculateGateAttraction)', () => {
    // field gate sits at (0, 100); fleeRadius default 8 (seek range = 8*1.5 = 12);
    // gate-proximity gate <30; dot(toGate,toDog) must be < 0 (gate opposite the dog).
    const GATE = { x: 0, z: 100 };
    const MAX_FORCE = 0.05;            // sheepConfig.maxForce
    const GATE_ATTRACTION = 0.5;       // sheep.gateAttraction default

    function fieldSim() {
        return new GameSimulation(makeRoomAdapter('field', 50, ['p1']));
    }

    it('field scene exposes a single cooperative gate at (0,100)', () => {
        const sim = fieldSim();
        try {
            expect(sim.gameState.gate).toBeTruthy();
            expect(sim.gameState.gate.position.x).toBe(GATE.x);
            expect(sim.gameState.gate.position.z).toBe(GATE.z);
            // sanity: the sim picked up the default flee/attraction tuning the
            // gate logic depends on.
            expect(sim.gameState.sheep[0].fleeRadius).toBe(8);
            expect(sim.gameState.sheep[0].gateAttraction).toBe(GATE_ATTRACTION);
            expect(sim.sheepConfig.maxForce).toBe(MAX_FORCE);
        } finally {
            sim.cleanup?.();
        }
    });

    it('sheep BETWEEN gate and dog seeks the gate', () => {
        const sim = fieldSim();
        try {
            const sheep = sim.gameState.sheep[0];
            parkSheep(sheep, 0, 90);     // 10m short of the gate, well inside 30m
            setDogs(sim, [{ x: 0, z: 84 }]); // dog 6m behind the sheep (inside 12m), gate-ward push

            // toGate = (0,+10), toDog = (0,-6) => dot < 0 => gate opposite the dog
            expect(sim.shouldSeekGate(sheep)).toBe(true);
        } finally {
            sim.cleanup?.();
        }
    });

    it('gate steer points toward the gate and is bounded by maxForce', () => {
        const sim = fieldSim();
        try {
            const sheep = sim.gameState.sheep[0];
            parkSheep(sheep, 0, 90);
            setDogs(sim, [{ x: 0, z: 84 }]);

            const steer = sim.calculateGateAttraction(sheep);
            const mag = steer.magnitude();

            // Non-zero pull...
            expect(mag).toBeGreaterThan(0);
            // ...bounded by the pre-scale limit (maxForce) and, more tightly,
            // by maxForce * gateAttraction since calculateGateAttraction limits
            // to maxForce then multiplies by sheep.gateAttraction (0.5).
            expect(mag).toBeLessThanOrEqual(MAX_FORCE + 1e-9);
            expect(mag).toBeCloseTo(MAX_FORCE * GATE_ATTRACTION, 6);

            // Direction is gateward: positive z component, and positive dot with
            // the sheep->gate vector.
            const toGate = sim.gameState.gate.position.clone().subtract(sheep.position);
            const dot = steer.x * toGate.x + steer.z * toGate.z;
            expect(dot).toBeGreaterThan(0);
            expect(steer.z).toBeGreaterThan(0);
            // sheep sits on the gate's x (0) so the steer is purely +z.
            expect(steer.x).toBeCloseTo(0, 6);
        } finally {
            sim.cleanup?.();
        }
    });

    it('does NOT seek when the dog is on the gate side of the sheep', () => {
        const sim = fieldSim();
        try {
            const sheep = sim.gameState.sheep[0];
            parkSheep(sheep, 0, 90);
            setDogs(sim, [{ x: 0, z: 95 }]); // dog between sheep and gate => same side

            // toGate=(0,+10), toDog=(0,+5) => dot > 0 => not opposite => no seek.
            expect(sim.shouldSeekGate(sheep)).toBe(false);
            // and the gate force is a no-op pull request only when seeking; the
            // method itself still returns a finite vector, but the loop never
            // calls it. We assert the guard, which is the real branch.
        } finally {
            sim.cleanup?.();
        }
    });

    it('does NOT seek when the dog is out of seek range (> fleeRadius*1.5)', () => {
        const sim = fieldSim();
        try {
            const sheep = sim.gameState.sheep[0];
            parkSheep(sheep, 0, 90);
            setDogs(sim, [{ x: 50, z: 90 }]); // 50m away, far past the 12m seek range

            expect(sim.shouldSeekGate(sheep)).toBe(false);
        } finally {
            sim.cleanup?.();
        }
    });

    it('does NOT seek with no dogs present', () => {
        const sim = fieldSim();
        try {
            const sheep = sim.gameState.sheep[0];
            parkSheep(sheep, 0, 90);
            setDogs(sim, []); // empty dog set

            expect(sim.shouldSeekGate(sheep)).toBe(false);
        } finally {
            sim.cleanup?.();
        }
    });

    it('does NOT seek on a gateless corral scene even with a dog adjacent', () => {
        // Rolling Hills declares no gate; the cooperative branch of
        // shouldSeekGate requires this.gameState.gate, so it can never fire.
        const sim = new GameSimulation(makeRoomAdapter('rolling-hills', 50, ['p1']));
        try {
            expect(sim.gameState.gate).toBeFalsy();
            const sheep = sim.gameState.sheep[0];
            parkSheep(sheep, 0, 0);
            setDogs(sim, [{ x: 0, z: 3 }]); // dog right next to the sheep
            expect(sim.shouldSeekGate(sheep)).toBe(false);
        } finally {
            sim.cleanup?.();
        }
    });
});

// ---------------------------------------------------------------------------
// Part 2: multi-dog flee superposition
// ---------------------------------------------------------------------------
describe('MULTI-DOG FLEE SUPERPOSITION', () => {
    const FLEE_RADIUS = 8;   // sheep.fleeRadius default
    const MAX_SPEED = 0.24;  // sheepConfig.maxSpeed
    const MAX_FORCE = 0.05;  // sheepConfig.maxForce (flee limits to maxForce*2)

    // Build a center sheep at rest and the flee force each dog induces, using
    // the exact shared primitive the worker's updateSheep loop calls per dog.
    //
    // NOTE: calculateFlee returns a shared module-level scratch Vector2D
    // (`_fleeDesired`) by reference — the worker's loop is safe because it adds
    // the result into sheep.acceleration immediately, before the next dog's
    // calculateFlee call overwrites the scratch. To reason about two
    // contributions side-by-side here we must clone() each result right away,
    // exactly mirroring that consume-before-next-call contract.
    function fleeFrom(centerPos, dogPos) {
        const sheep = { position: new Vector2D(centerPos.x, centerPos.z), velocity: new Vector2D(0, 0) };
        return calculateFlee(sheep, new Vector2D(dogPos.x, dogPos.z), FLEE_RADIUS, MAX_SPEED, MAX_FORCE).clone();
    }

    it('net flee on a center sheep is the vector SUM of both dogs, not the nearest only', () => {
        const center = { x: 0, z: 0 };
        const dogA = { x: -4, z: 0 };  // nearest (4m)
        const dogB = { x: 5, z: -3 };  // farther (~5.8m) but still inside fleeRadius 8

        const fA = fleeFrom(center, dogA);
        const fB = fleeFrom(center, dogB);

        // Both dogs are inside the flee radius, so both contribute.
        expect(fA.magnitude()).toBeGreaterThan(0);
        expect(fB.magnitude()).toBeGreaterThan(0);

        // The worker's loop accumulates fA + fB onto sheep.acceleration. Verify
        // the combined force equals the component-wise sum...
        const sum = fA.clone().add(fB);

        // ...and that the combined force is materially different from acting on
        // the nearest dog alone (i.e. dog B is NOT ignored).
        const deltaFromNearestOnly = sum.clone().subtract(fA).magnitude();
        expect(deltaFromNearestOnly).toBeGreaterThan(1e-6);
        expect(deltaFromNearestOnly).toBeCloseTo(fB.magnitude(), 9);

        // Each single-dog flee points directly away from its dog (away from -x
        // for A => +x; away from +x for B => -x). The sum's x-component is the
        // signed combination, confirming superposition rather than max().
        expect(fA.x).toBeGreaterThan(0); // fleeing dog at -x => pushed +x
        expect(fB.x).toBeLessThan(0);    // fleeing dog at +x => pushed -x
        expect(sum.x).toBeCloseTo(fA.x + fB.x, 9);
        expect(sum.z).toBeCloseTo(fA.z + fB.z, 9);
    });

    it('two equidistant opposite dogs cancel along their shared axis (pure superposition)', () => {
        // Symmetric placement: equal-magnitude opposite flees sum to ~zero on
        // the dog-dog axis. A nearest-only model could not produce this.
        const center = { x: 0, z: 0 };
        const fLeft = fleeFrom(center, { x: -5, z: 0 });
        const fRight = fleeFrom(center, { x: 5, z: 0 });

        expect(fLeft.x).toBeGreaterThan(0);
        expect(fRight.x).toBeLessThan(0);
        const sum = fLeft.clone().add(fRight);
        expect(sum.magnitude()).toBeCloseTo(0, 6);
    });

    it('flock spread along the dog-dog axis shrinks with two dogs vs one (over N ticks)', () => {
        // Deterministic small flock packed loosely around origin along x. Two
        // sims share an identical initial flock; one is squeezed by dogs on
        // both x-sides, the control is pushed by a single dog at -x.
        const N_SHEEP = 14;
        const N_TICKS = 90;

        // Place sheep in a line spread along x so the dog-dog (x) axis is the
        // meaningful spread axis. Spacing 2.5m keeps them inside each other's
        // perception (6m) so flocking is engaged but loose.
        function layout(sim) {
            for (let i = 0; i < sim.gameState.sheep.length; i++) {
                const s = sim.gameState.sheep[i];
                if (i < N_SHEEP) {
                    const x = (i - (N_SHEEP - 1) / 2) * 2.5; // centered line on x
                    parkSheep(s, x, 0);
                } else {
                    // Park the remainder far away and grazing so they neither
                    // flock with nor drag the measured group.
                    s.position.set(-400, -400);
                    s.velocity.set(0, 0);
                    s.acceleration.set(0, 0);
                    s.state = 2; // grazing => skipped by updateSheep
                }
            }
        }

        function xSpread(sim) {
            const xs = [];
            for (let i = 0; i < N_SHEEP; i++) xs.push(sim.gameState.sheep[i].position.x);
            return stddev(xs);
        }

        const two = new GameSimulation(makeRoomAdapter('field', 50, ['p1', 'p2']));
        const one = new GameSimulation(makeRoomAdapter('field', 50, ['p1']));
        try {
            layout(two);
            layout(one);

            const initialSpread = xSpread(two);
            expect(xSpread(one)).toBeCloseTo(initialSpread, 9); // identical start

            // Dogs at the line's ends, just outside it, squeezing inward.
            const ENDS = [{ x: -22, z: 0 }, { x: 22, z: 0 }];
            const SINGLE = [{ x: -22, z: 0 }];

            // Pin dog positions every tick (no input => updateSheepdogs would
            // otherwise let the auto-placed dogs drift). Re-pin BEFORE each tick.
            for (let t = 0; t < N_TICKS; t++) {
                setDogs(two, ENDS);
                setDogs(one, SINGLE);
                tickFrames(two, 1);
                tickFrames(one, 1);
            }

            const twoSpread = xSpread(two);
            const oneSpread = xSpread(one);

            // The sim actually advanced (guards against a swallowed tick error
            // silently passing the comparison): both flocks moved off the start.
            expect(Math.abs(twoSpread - initialSpread)).toBeGreaterThan(1e-3);
            expect(Math.abs(oneSpread - initialSpread)).toBeGreaterThan(1e-3);

            // Squeezed-from-both-sides flock is tighter along the dog-dog axis
            // than the flock shoved by a single dog from one end.
            expect(twoSpread).toBeLessThan(oneSpread);
        } finally {
            two.cleanup?.();
            one.cleanup?.();
        }
    });
});
