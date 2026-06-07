// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 66 P2: client-side pen containment.
 *
 * Proves the square-fence barrier with a single gate gap:
 *   1. an outsider ramming a non-gate edge is kept out,
 *   2. a sheep at the open gate crosses in and retires (state 2, no zap),
 *   3. a closed gate seals the gap,
 *   4. the dog collides with the fence too,
 *   5. pennedCount tracks retired sheep.
 */
import { describe, it, expect } from 'vitest';
import { PenContainment } from '../shared/survival/pen.js';

// Pen box x[-10,10] z[-10,10]; gate gap on the west edge (x=-10), z in [-2,2].
const PEN = { center: { x: 0, z: 0 }, radius: 10 };
const GATE = { x: -10, z: 0, width: 4 };

function makeSheep(x, z, extra = {}) {
    return {
        state: 0,
        penned: false,
        hasPassedGate: false,
        facingDirection: 0,
        position: { x, z },
        velocity: { x: 0, z: 0, set(a, b) { this.x = a; this.z = b; } },
        renderPosition: { x, z, set(a, b) { this.x = a; this.z = b; } },
        ...extra,
    };
}

function makeDog(x, z) {
    return { position: { x, z } };
}

describe('PenContainment (Cycle 66 P2)', () => {
    it('keeps an outsider out at a non-gate edge', () => {
        const pc = new PenContainment(PEN, GATE);
        // Approaching the west fence away from the gap (z = 6).
        const s = makeSheep(-10.4, 6);
        pc.update([s], null, true, 0.016);
        // Pushed back outside; never penned.
        expect(s.position.x).toBeLessThanOrEqual(-10);
        expect(s.penned).toBe(false);
        expect(pc.pennedCount).toBe(0);
    });

    it('retires a sheep that is inside the pen, even deep and off the gate axis', () => {
        // Regression (Cycle 66 P2 browser smoke): a sheep that crossed the gate and
        // moved past the gap depth must retire, not get ejected. The barrier
        // guarantees "inside => entered via the gate", so any inside sheep retires.
        const pc = new PenContainment(PEN, GATE);
        const s = makeSheep(5, 5); // well inside, nowhere near the gate
        pc.update([s], null, true, 0.016);
        expect(s.penned).toBe(true);
        expect(s.state).toBe(2);          // retired/grazing (no zap, no teleport)
        expect(s.hasPassedGate).toBe(true);
        expect(pc.pennedCount).toBe(1);
    });

    it('lets an outsider stand in the open gate gap without ejecting it', () => {
        const pc = new PenContainment(PEN, GATE);
        const s = makeSheep(-10.3, 0); // outside the west edge, within the gap, gate open
        pc.update([s], null, true, 0.016);
        expect(s.penned).toBe(false);            // not inside yet
        expect(s.position.x).toBeCloseTo(-10.3);  // free passage: not pushed
    });

    it('seals the gate gap when the gate is closed', () => {
        const pc = new PenContainment(PEN, GATE);
        const s = makeSheep(-10.3, 0); // at the gap from outside, but gate shut
        pc.update([s], null, false, 0.016);
        expect(s.penned).toBe(false);
        expect(s.position.x).toBeLessThan(-10); // pushed back out
    });

    it('collides the dog with the fence at a non-gate edge', () => {
        const pc = new PenContainment(PEN, GATE);
        const dog = makeDog(-10.3, 7); // ramming the west fence off-gate
        pc.update([], dog, true, 0.016);
        expect(dog.position.x).toBeLessThanOrEqual(-10);
    });

    it('lets the dog pass through the open gate', () => {
        const pc = new PenContainment(PEN, GATE);
        const dog = makeDog(-9.0, 0); // inside via the gap
        pc.update([], dog, true, 0.016);
        // Dog is allowed inside; not ejected.
        expect(dog.position.x).toBeGreaterThan(-10);
    });

    it('keeps a settled sheep penned and counted across frames', () => {
        const pc = new PenContainment(PEN, GATE);
        const s = makeSheep(0, 0, { penned: true, state: 2, hasPassedGate: true });
        pc.update([s], null, true, 0.016);
        expect(pc.pennedCount).toBe(1);
        expect(s.penned).toBe(true);
    });

    it('settle-walk moves a freshly penned sheep toward a spot inside, then rests', () => {
        const pc = new PenContainment(PEN, GATE, { settleSpeed: 100 });
        const s = makeSheep(-9.5, 0);
        // First frame: crosses + becomes penned with a settle target.
        pc.update([s], null, true, 0.016);
        expect(s._penSettling).toBe(true);
        // Run enough frames for the fast settle to complete.
        for (let i = 0; i < 30; i++) pc.update([s], null, true, 0.05);
        expect(s._penSettling).toBe(false);
        // Came to rest inside the fence box.
        expect(s.position.x).toBeGreaterThan(-10);
        expect(s.position.x).toBeLessThan(10);
        expect(s.position.z).toBeGreaterThan(-10);
        expect(s.position.z).toBeLessThan(10);
    });

    it('produces a byte-identical settle spot for a fixed (settleSeed, sheepId)', () => {
        // Cycle 67 P1: the Cycle 66 Math.random settle spot is now a seeded draw,
        // so the Worker authority is deterministic. Same (seed, id) => same spot.
        const a = new PenContainment(PEN, GATE, { settleSeed: 1234 });
        const b = new PenContainment(PEN, GATE, { settleSeed: 1234 });
        const s1 = a._settleSpot(7);
        const s2 = b._settleSpot(7);
        expect(s1.x).toBe(s2.x);
        expect(s1.z).toBe(s2.z);
        // The spot lands inside the inset box (4m off every fence edge).
        expect(s1.x).toBeGreaterThanOrEqual(-6);
        expect(s1.x).toBeLessThanOrEqual(6);
        expect(s1.z).toBeGreaterThanOrEqual(-6);
        expect(s1.z).toBeLessThanOrEqual(6);
        // Different sheep ids draw different spots (no pile-up on one tile).
        const other = a._settleSpot(8);
        expect(other.x === s1.x && other.z === s1.z).toBe(false);
    });
});
