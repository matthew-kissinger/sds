// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P0-DETTEST: determinism coverage for the competitive-mode surfaces of
 * shared/GameStateValidation.js plus getRequiredSheep (which lives in
 * shared/ObjectiveLogic.js and is re-exported from shared/index.js).
 *
 * Three contracts pinned here:
 *
 *   1. getRequiredSheep is pure: same inputs give identical outputs across
 *      repeated calls, regardless of objective key insertion order, with no
 *      input mutation.
 *   2. updateSheepRetirements under a seeded mulberry32 rng produces
 *      identical counters AND identical retirement-target coordinates for
 *      identically built scenarios (the Worker passes a per-game seeded rng
 *      for exactly this reproducibility).
 *   3. checkCompetitiveCompletion is insertion-order independent: playerScores
 *      objects built in different key orders (Worker join order vs a client's
 *      snapshot-reconstructed copy) name the SAME winner, and tied max scores
 *      resolve to the lexicographically lowest playerId. This pins the
 *      P0-DETBUG fix (commit e420ee6: sorted-playerId tie-break).
 *
 * Entity construction mirrors tests/sim-baseline/harness.js makeSheep; the
 * gate/pasture shapes mirror shared/index.js createGameState for the 'field'
 * scene (north gate at (0, 100), width 8, pasture z in [102, 130]).
 */

import { describe, it, expect } from 'vitest';
import {
    updateSheepRetirements,
    checkCompetitiveCompletion
} from '../shared/GameStateValidation.js';
import { getRequiredSheep } from '../shared/ObjectiveLogic.js';
import { Vector2D } from '../shared/Vector2D.js';
import { mulberry32 } from './sim-baseline/harness.js';

function makeSheep(id, x, z, vx = 0, vz = 0) {
    return {
        id,
        position: new Vector2D(x, z),
        velocity: new Vector2D(vx, vz),
        acceleration: new Vector2D(0, 0),
        hasPassedGate: false,
        isRetiring: false,
        retirementTarget: null,
        state: 0,
        fleeRadius: 8,
        gateAttraction: 0.5,
        assignedGate: null
    };
}

describe('getRequiredSheep determinism', () => {
    const objectives = [
        null,
        { requiredSheep: 40, requiredSheepFraction: 0.99, requiredSheepMin: 99 },
        { requiredSheepFraction: 0.40, requiredSheepMin: 10 },
        { roundupZone: { x: 0, z: 0, radius: 30 }, holdRequired: 2.0 }
    ];
    const totals = [0, 3, 9, 10, 25, 50, 200, 1000, 5000];

    it('repeated calls with the same inputs return identical results', () => {
        const first = objectives.map(obj => totals.map(t => getRequiredSheep(obj, t)));
        for (let rep = 0; rep < 3; rep++) {
            const again = objectives.map(obj => totals.map(t => getRequiredSheep(obj, t)));
            expect(again).toEqual(first);
        }
    });

    it('objective key insertion order does not change the result', () => {
        const inOrder = { requiredSheepFraction: 0.40, requiredSheepMin: 10, holdRequired: 2.0 };
        const reversed = { holdRequired: 2.0, requiredSheepMin: 10, requiredSheepFraction: 0.40 };
        for (const total of totals) {
            expect(getRequiredSheep(inOrder, total)).toBe(getRequiredSheep(reversed, total));
        }
    });

    it('does not mutate the objective input', () => {
        const obj = { requiredSheepFraction: 0.40, requiredSheepMin: 10 };
        const before = JSON.stringify(obj);
        getRequiredSheep(obj, 200);
        expect(JSON.stringify(obj)).toBe(before);
    });
});

describe('updateSheepRetirements determinism (seeded rng)', () => {
    const SEED = 0xC0FFEE42;

    // Mirrors createGameState('field'): north gate at (0, 100), width 8,
    // passage zone z in [gateZ - 2, gateZ + 2]; pasture beyond the fence.
    function buildScenario() {
        const gate = {
            position: new Vector2D(0, 100),
            width: 8,
            height: 4,
            passageZone: { minX: -4, maxX: 4, minZ: 98, maxZ: 102 }
        };
        const pasture = { minX: -30, maxX: 30, minZ: 102, maxZ: 130 };
        const sheep = [
            makeSheep(0, 0, 99, 0, 0.3),     // in zone, northbound: retires
            makeSheep(1, -2, 100, 0, 0.2),   // in zone, northbound: retires
            makeSheep(2, 3, 101, 0.1, 0.4),  // in zone, northbound: retires
            makeSheep(3, 0, 99, 0, -0.3),    // in zone but southbound: no
            makeSheep(4, 0, 50, 0, 0.5),     // northbound but outside the zone: no
            makeSheep(5, 20, 20, 0, 0)       // idle in the field: no
        ];
        return { sheep, gate, pasture };
    }

    function runScenario(seed) {
        const { sheep, gate, pasture } = buildScenario();
        const result = updateSheepRetirements(sheep, gate, pasture, mulberry32(seed));
        return {
            result,
            sheep: sheep.map(s => ({
                id: s.id,
                hasPassedGate: s.hasPassedGate,
                isRetiring: s.isRetiring,
                target: s.retirementTarget
                    ? { x: s.retirementTarget.x, z: s.retirementTarget.z }
                    : null
            }))
        };
    }

    it('retires exactly the in-zone northbound sheep', () => {
        const { result, sheep } = runScenario(SEED);
        expect(result).toEqual({ newRetirements: 3, totalRetired: 3 });
        expect(sheep.filter(s => s.isRetiring).map(s => s.id)).toEqual([0, 1, 2]);
        expect(sheep.filter(s => !s.isRetiring).map(s => s.id)).toEqual([3, 4, 5]);
    });

    it('identical seeds produce identical retirement targets across repeated runs', () => {
        const first = runScenario(SEED);
        for (let rep = 0; rep < 3; rep++) {
            expect(runScenario(SEED)).toEqual(first);
        }
        // The targets are real coordinates inside the pasture (3m margin).
        for (const s of first.sheep.filter(x => x.isRetiring)) {
            expect(s.target.x).toBeGreaterThanOrEqual(-27);
            expect(s.target.x).toBeLessThanOrEqual(27);
            expect(s.target.z).toBeGreaterThanOrEqual(105);
            expect(s.target.z).toBeLessThanOrEqual(127);
        }
    });

    it('a different seed moves only the retirement targets, never the counters', () => {
        const a = runScenario(SEED);
        const b = runScenario(SEED ^ 0xFFFF);
        expect(b.result).toEqual(a.result);
        expect(b.sheep.map(s => s.isRetiring)).toEqual(a.sheep.map(s => s.isRetiring));
        // At least one retirement target differs (the rng stream changed).
        const targetsA = JSON.stringify(a.sheep.map(s => s.target));
        const targetsB = JSON.stringify(b.sheep.map(s => s.target));
        expect(targetsB).not.toBe(targetsA);
    });
});

describe('checkCompetitiveCompletion determinism (pins P0-DETBUG / e420ee6)', () => {
    it('2p tie at the race threshold: identical winner for different key insertion orders', () => {
        // 200 sheep, threshold ceil(200/2) = 100. Both players tied at 100.
        const joinOrder = { bravo: 100, alpha: 100 };   // Worker live object, join order
        const snapshotOrder = { alpha: 100, bravo: 100 }; // client rebuild, different order
        const a = checkCompetitiveCompletion(joinOrder, 2, 200);
        const b = checkCompetitiveCompletion(snapshotOrder, 2, 200);
        expect(a.isComplete).toBe(true);
        expect(b.isComplete).toBe(true);
        expect(a.winner).toBe(b.winner);
        expect(a.winType).toBe('race');
        expect(b.winType).toBe('race');
    });

    it('tied max scores resolve to the lexicographically lowest playerId, even when inserted last', () => {
        const result = checkCompetitiveCompletion({ zulu: 100, mike: 100, alpha: 100 }, 2, 200);
        expect(result.isComplete).toBe(true);
        expect(result.winner).toBe('alpha');
    });

    it('3-4p highest_score branch: same sorted tie-break, order independent', () => {
        // 3 players, 90 sheep all collected, three-way tie at 30.
        const a = checkCompetitiveCompletion({ charlie: 30, alpha: 30, bravo: 30 }, 3, 90);
        const b = checkCompetitiveCompletion({ bravo: 30, charlie: 30, alpha: 30 }, 3, 90);
        expect(a.isComplete).toBe(true);
        expect(a.winType).toBe('highest_score');
        expect(a.winner).toBe('alpha');
        expect(b.winner).toBe('alpha');

        // 4 players, 200 sheep all collected, four-way tie at 50; descending
        // insertion order must not leak into the winner.
        const c = checkCompetitiveCompletion({ p4: 50, p3: 50, p2: 50, p1: 50 }, 4, 200);
        expect(c.isComplete).toBe(true);
        expect(c.winner).toBe('p1');
    });

    it('repeated calls on the same playerScores object return identical results', () => {
        const scores = { bravo: 100, alpha: 100 };
        const first = checkCompetitiveCompletion(scores, 2, 200);
        const second = checkCompetitiveCompletion(scores, 2, 200);
        expect(second).toEqual(first);
        expect(second.winner).toBe(first.winner);
    });

    it('a snapshot-reconstructed copy (sorted keys) agrees with the join-order original', () => {
        // Simulate the Worker DO's live object (join order) vs a client copy
        // rebuilt from a decoded snapshot whose key order differs.
        const live = { delta: 100, alpha: 100, charlie: 40 };
        const rebuilt = {};
        for (const key of Object.keys(live).sort()) rebuilt[key] = live[key];
        const a = checkCompetitiveCompletion(live, 2, 200);
        const b = checkCompetitiveCompletion(rebuilt, 2, 200);
        expect(a.winner).toBe('alpha');
        expect(b.winner).toBe('alpha');
        expect(b.isComplete).toBe(a.isComplete);
        expect(b.winType).toBe(a.winType);
    });

    it('untied scores: the highest scorer wins regardless of insertion order', () => {
        const a = checkCompetitiveCompletion({ alpha: 80, bravo: 120 }, 2, 200);
        const b = checkCompetitiveCompletion({ bravo: 120, alpha: 80 }, 2, 200);
        expect(a.winner).toBe('bravo');
        expect(b.winner).toBe('bravo');
    });

    it('below the threshold the game is incomplete with no winner', () => {
        const result = checkCompetitiveCompletion({ alpha: 99, bravo: 99 }, 2, 200);
        expect(result).toEqual({ isComplete: false, winner: null, winType: null });

        // 3p: not all sheep collected yet.
        const partial = checkCompetitiveCompletion({ alpha: 30, bravo: 30, charlie: 29 }, 3, 90);
        expect(partial.isComplete).toBe(false);
        expect(partial.winner).toBeNull();
    });
});
