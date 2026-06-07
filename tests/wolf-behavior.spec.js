// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 66 P4: pure wolf-AI helpers (js/gamestate/wolfBehavior.js).
 * Kept Three-free so the decision math is unit-testable in Node; the rendering
 * pack (js/gamestate/wolfPack.js) wires these to the Wolf rig + the survival run.
 */
import { describe, it, expect } from 'vitest';
import {
    spawnCountForDay,
    nearestHuntableIndex,
    stepToward,
    stepAway,
} from '../shared/survival/wolfBehavior.js';

describe('spawnCountForDay (Q3 escalation)', () => {
    it('starts the pack small on night one', () => {
        expect(spawnCountForDay(1)).toBe(2);
    });
    it('escalates one per day', () => {
        expect(spawnCountForDay(2)).toBe(3);
        expect(spawnCountForDay(5)).toBe(6);
    });
    it('clamps at the ceiling', () => {
        expect(spawnCountForDay(100)).toBe(8);
    });
    it('honours custom tuning', () => {
        expect(spawnCountForDay(3, { base: 1, perDay: 2, max: 10 })).toBe(5);
        expect(spawnCountForDay(50, { base: 1, perDay: 2, max: 10 })).toBe(10);
    });
    it('treats day 0 / garbage as day one', () => {
        expect(spawnCountForDay(0)).toBe(2);
        expect(spawnCountForDay(NaN)).toBe(2);
    });
});

describe('nearestHuntableIndex', () => {
    const huntable = (s) => !!s && s.state === 0 && !s.penned && !s.killed;
    const sheep = [
        { position: { x: 100, z: 0 }, state: 0 },                 // far
        { position: { x: 5, z: 0 }, state: 0 },                   // near, huntable
        { position: { x: 1, z: 0 }, state: 2, penned: true },     // nearest but penned
        { position: { x: 2, z: 0 }, state: 0, killed: true },     // nearer but dead
    ];
    it('returns the nearest huntable sheep, skipping penned + killed', () => {
        expect(nearestHuntableIndex(0, 0, sheep, huntable)).toBe(1);
    });
    it('returns -1 when nothing is huntable', () => {
        const allSafe = [{ position: { x: 0, z: 0 }, state: 2, penned: true }];
        expect(nearestHuntableIndex(0, 0, allSafe, huntable)).toBe(-1);
    });
    it('tolerates an empty / non-array flock', () => {
        expect(nearestHuntableIndex(0, 0, [], huntable)).toBe(-1);
        expect(nearestHuntableIndex(0, 0, null, huntable)).toBe(-1);
    });
});

describe('stepToward', () => {
    it('advances toward the target without overshooting', () => {
        const r = stepToward(0, 0, 10, 0, 5, 1); // would move 5, target at 10
        expect(r.x).toBeCloseTo(5, 6);
        expect(r.z).toBeCloseTo(0, 6);
        expect(r.dirX).toBeCloseTo(1, 6);
    });
    it('clamps to the target on the last step (no overshoot)', () => {
        const r = stepToward(0, 0, 2, 0, 100, 1); // speed*dt=100 >> dist 2
        expect(r.x).toBeCloseTo(2, 6);
    });
    it('no-ops at the target', () => {
        const r = stepToward(3, 3, 3, 3, 5, 1);
        expect(r.moved).toBe(0);
    });
});

describe('stepAway', () => {
    it('moves directly away from the origin at speed', () => {
        const r = stepAway(5, 0, 0, 0, 10, 1); // flee from origin, +x side
        expect(r.x).toBeCloseTo(15, 6);
        expect(r.dirX).toBeCloseTo(1, 6);
    });
    it('uses a stable fallback when on top of the origin', () => {
        const r = stepAway(0, 0, 0, 0, 4, 1);
        expect(Number.isFinite(r.x)).toBe(true);
        expect(r.moved).toBe(4);
    });
});
