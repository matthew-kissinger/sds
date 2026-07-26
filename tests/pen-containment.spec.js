// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 66 P2: the square pen barrier.
 * Cycle 117 P1: the same barrier on an arbitrary rect.
 *
 * Proves the fence box with a single gate gap:
 *   1. an outsider ramming a non-gate edge is kept out,
 *   2. a sheep at the open gate crosses in and retires (state 2, no zap),
 *   3. a closed gate seals the gap,
 *   4. the dog collides with the fence too,
 *   5. pennedCount tracks retired sheep.
 *
 * The nine square cases below are the Cycle 66 originals, with their literal
 * coordinates intact. `barrierBehaviour` then re-states those same behaviours
 * against a barrier's OWN resolved geometry - every coordinate derived from
 * `pb.minX/maxX/minZ/maxZ`, `pb.gateX/gateZ/gateHalf` and `pb.sheepBody/dogBody`,
 * none typed - and runs the block twice: once on the square, once on a rect. So
 * "a rect behaves as a square does" is one block passing on both geometries
 * rather than two hand-written sets of expectations that could drift apart.
 */
import { describe, it, expect } from 'vitest';
import { PenBarrier } from '../shared/PenBarrier.js';

// Pen box x[-10,10] z[-10,10]; gate gap on the west edge (x=-10), z in [-2,2].
const PEN = { center: { x: 0, z: 0 }, radius: 10 };
const GATE = { x: -10, z: 0, width: 4 };

// A non-square pasture: 70m along x, 40m along z, off the origin, gate on the
// west (short) edge. The shape Rolling Hills wants and the square form cannot
// express.
const RECT_PEN = { minX: 60, maxX: 130, minZ: 40, maxZ: 80 };
const RECT_GATE = { x: 60, z: 60, width: 12 };

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

describe('PenBarrier, square form (Cycle 66 P2)', () => {
    it('keeps an outsider out at a non-gate edge', () => {
        const pc = new PenBarrier(PEN, GATE);
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
        const pc = new PenBarrier(PEN, GATE);
        const s = makeSheep(5, 5); // well inside, nowhere near the gate
        pc.update([s], null, true, 0.016);
        expect(s.penned).toBe(true);
        expect(s.state).toBe(2);          // retired/grazing (no zap, no teleport)
        expect(s.hasPassedGate).toBe(true);
        expect(pc.pennedCount).toBe(1);
    });

    it('lets an outsider stand in the open gate gap without ejecting it', () => {
        const pc = new PenBarrier(PEN, GATE);
        const s = makeSheep(-10.3, 0); // outside the west edge, within the gap, gate open
        pc.update([s], null, true, 0.016);
        expect(s.penned).toBe(false);            // not inside yet
        expect(s.position.x).toBeCloseTo(-10.3);  // free passage: not pushed
    });

    it('seals the gate gap when the gate is closed', () => {
        const pc = new PenBarrier(PEN, GATE);
        const s = makeSheep(-10.3, 0); // at the gap from outside, but gate shut
        pc.update([s], null, false, 0.016);
        expect(s.penned).toBe(false);
        expect(s.position.x).toBeLessThan(-10); // pushed back out
    });

    it('collides the dog with the fence at a non-gate edge', () => {
        const pc = new PenBarrier(PEN, GATE);
        const dog = makeDog(-10.3, 7); // ramming the west fence off-gate
        pc.update([], dog, true, 0.016);
        expect(dog.position.x).toBeLessThanOrEqual(-10);
    });

    it('lets the dog pass through the open gate', () => {
        const pc = new PenBarrier(PEN, GATE);
        const dog = makeDog(-9.0, 0); // inside via the gap
        pc.update([], dog, true, 0.016);
        // Dog is allowed inside; not ejected.
        expect(dog.position.x).toBeGreaterThan(-10);
    });

    it('keeps a settled sheep penned and counted across frames', () => {
        const pc = new PenBarrier(PEN, GATE);
        const s = makeSheep(0, 0, { penned: true, state: 2, hasPassedGate: true });
        pc.update([s], null, true, 0.016);
        expect(pc.pennedCount).toBe(1);
        expect(s.penned).toBe(true);
    });

    it('settle-walk moves a freshly penned sheep toward a spot inside, then rests', () => {
        const pc = new PenBarrier(PEN, GATE, { settleSpeed: 100 });
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
        const a = new PenBarrier(PEN, GATE, { settleSeed: 1234 });
        const b = new PenBarrier(PEN, GATE, { settleSeed: 1234 });
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

/**
 * A point `out` metres OUTSIDE the gate edge (negative goes inside) and `along`
 * metres along that edge from the gate centre. Derived from the barrier itself,
 * so the same expression addresses a square and a rect, and a north-edge gate
 * and a west-edge one.
 */
function nearGate(pb, out, along) {
    const outward = pb.onVertical
        ? Math.sign(pb.gateX - pb.cx)
        : Math.sign(pb.gateZ - pb.cz);
    return pb.onVertical
        ? { x: pb.gateX + outward * out, z: pb.gateZ + along }
        : { x: pb.gateX + along, z: pb.gateZ + outward * out };
}

/** How far a point sits from the gate edge's fence line, on the across axis. */
function standoff(pb, p) {
    return pb.onVertical ? Math.abs(p.x - pb.gateX) : Math.abs(p.z - pb.gateZ);
}

/**
 * The nine behaviours above, stated against the barrier's own geometry. Run on
 * the square and on the rect: the acceptance is that one block passes on both.
 */
function barrierBehaviour(label, pen, gate) {
    const build = (opts) => new PenBarrier(pen, gate, opts);

    describe(label, () => {
        it('keeps an outsider out at a non-gate stretch of the gate edge', () => {
            const pb = build();
            const p = nearGate(pb, 0.4, pb.gateHalf + 3);
            const s = makeSheep(p.x, p.z);
            pb.update([s], null, true, 0.016);
            expect(pb._isInside(s.position.x, s.position.z)).toBe(false);
            // Pushed out to exactly the Minkowski standoff, not merely left alone.
            expect(standoff(pb, s.position)).toBeCloseTo(pb.sheepBody, 10);
            expect(s.penned).toBe(false);
            expect(pb.pennedCount).toBe(0);
        });

        it('retires a sheep that is inside, deep and off the gate axis', () => {
            const pb = build();
            const s = makeSheep(pb.cx + pb.halfX * 0.5, pb.cz + pb.halfZ * 0.5);
            pb.update([s], null, true, 0.016);
            expect(s.penned).toBe(true);
            expect(s.state).toBe(2);
            expect(s.hasPassedGate).toBe(true);
            expect(pb.pennedCount).toBe(1);
        });

        it('lets an outsider stand in the open gate gap without ejecting it', () => {
            const pb = build();
            const p = nearGate(pb, 0.3, 0);
            const s = makeSheep(p.x, p.z);
            pb.update([s], null, true, 0.016);
            expect(s.penned).toBe(false);
            expect(s.position.x).toBe(p.x);
            expect(s.position.z).toBe(p.z);
        });

        it('seals the gate gap when the gate is closed', () => {
            const pb = build();
            const p = nearGate(pb, 0.3, 0);
            const s = makeSheep(p.x, p.z);
            pb.update([s], null, false, 0.016);
            expect(s.penned).toBe(false);
            expect(pb._isInside(s.position.x, s.position.z)).toBe(false);
            expect(standoff(pb, s.position)).toBeCloseTo(pb.sheepBody, 10);
        });

        it('collides the dog with the fence at a non-gate stretch', () => {
            const pb = build();
            const p = nearGate(pb, 0.3, pb.gateHalf + 5);
            const dog = makeDog(p.x, p.z);
            pb.update([], dog, true, 0.016);
            expect(pb._isInside(dog.position.x, dog.position.z)).toBe(false);
            expect(standoff(pb, dog.position)).toBeCloseTo(pb.dogBody, 10);
        });

        it('lets the dog pass through the open gate', () => {
            const pb = build();
            const p = nearGate(pb, -1.0, 0);
            const dog = makeDog(p.x, p.z);
            pb.update([], dog, true, 0.016);
            expect(pb._isInside(dog.position.x, dog.position.z)).toBe(true);
        });

        it('keeps a settled sheep penned and counted across frames', () => {
            const pb = build();
            const s = makeSheep(pb.cx, pb.cz, { penned: true, state: 2, hasPassedGate: true });
            pb.update([s], null, true, 0.016);
            expect(pb.pennedCount).toBe(1);
            expect(s.penned).toBe(true);
        });

        it('settle-walk moves a freshly penned sheep to a spot inside, then rests', () => {
            const pb = build({ settleSpeed: 100 });
            const p = nearGate(pb, -0.5, 0);
            const s = makeSheep(p.x, p.z);
            pb.update([s], null, true, 0.016);
            expect(s._penSettling).toBe(true);
            for (let i = 0; i < 30; i++) pb.update([s], null, true, 0.05);
            expect(s._penSettling).toBe(false);
            expect(pb._isInside(s.position.x, s.position.z)).toBe(true);
        });

        it('draws a seeded settle spot inset from every edge', () => {
            const a = build({ settleSeed: 1234 });
            const b = build({ settleSeed: 1234 });
            expect(a._settleSpot(7).x).toBe(b._settleSpot(7).x);
            expect(a._settleSpot(7).z).toBe(b._settleSpot(7).z);
            const spot = a._settleSpot(7);
            const inset = 4;
            expect(spot.x).toBeGreaterThanOrEqual(a.minX + inset);
            expect(spot.x).toBeLessThanOrEqual(a.maxX - inset);
            expect(spot.z).toBeGreaterThanOrEqual(a.minZ + inset);
            expect(spot.z).toBeLessThanOrEqual(a.maxZ - inset);
            const other = a._settleSpot(8);
            expect(other.x === spot.x && other.z === spot.z).toBe(false);
        });
    });
}

barrierBehaviour('PenBarrier behaviour, square geometry', PEN, GATE);
barrierBehaviour('PenBarrier behaviour, rect geometry (Cycle 117 P1)', RECT_PEN, RECT_GATE);
barrierBehaviour(
    'PenBarrier behaviour, rect geometry with the gate on the long edge (Cycle 117 P1)',
    RECT_PEN,
    { x: (RECT_PEN.minX + RECT_PEN.maxX) / 2, z: RECT_PEN.maxZ, width: 12 },
);

describe('PenBarrier rect form (Cycle 117 P1)', () => {
    it('resolves the same barrier from {center,radius} and the equivalent rect', () => {
        // The rect side is derived from the square PEN, so this cannot pass by
        // two hand-typed boxes happening to agree.
        const square = new PenBarrier(PEN, GATE);
        const rect = new PenBarrier({
            minX: PEN.center.x - PEN.radius,
            maxX: PEN.center.x + PEN.radius,
            minZ: PEN.center.z - PEN.radius,
            maxZ: PEN.center.z + PEN.radius,
        }, GATE);
        for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'cx', 'cz', 'halfX', 'halfZ', 'onVertical']) {
            expect(rect[k]).toBe(square[k]);
        }
    });

    it('takes the rect form when both forms are present', () => {
        const pb = new PenBarrier({ ...RECT_PEN, center: { x: 0, z: 0 }, radius: 5 }, RECT_GATE);
        expect(pb.minX).toBe(RECT_PEN.minX);
        expect(pb.maxX).toBe(RECT_PEN.maxX);
        expect(pb.halfX).toBe((RECT_PEN.maxX - RECT_PEN.minX) / 2);
        expect(pb.halfZ).toBe((RECT_PEN.maxZ - RECT_PEN.minZ) / 2);
        expect(pb.cx).toBe((RECT_PEN.minX + RECT_PEN.maxX) / 2);
        expect(pb.cz).toBe((RECT_PEN.minZ + RECT_PEN.maxZ) / 2);
    });

    it('normalises a rect declared with a swapped pair', () => {
        const swapped = new PenBarrier({
            minX: RECT_PEN.maxX, maxX: RECT_PEN.minX,
            minZ: RECT_PEN.maxZ, maxZ: RECT_PEN.minZ,
        }, RECT_GATE);
        const straight = new PenBarrier(RECT_PEN, RECT_GATE);
        for (const k of ['minX', 'maxX', 'minZ', 'maxZ', 'cx', 'cz', 'halfX', 'halfZ']) {
            expect(swapped[k]).toBe(straight[k]);
        }
    });

    it('picks the gate edge by the gap left to each face, not by the raw offset', () => {
        // The regression this generalisation exists for. On a long, thin pasture
        // a gate on a LONG (horizontal) edge can sit further from the centre in x
        // than in z, so the Cycle 66 rule `|dx| >= |dz|` calls it a vertical edge
        // and gaps the fence on the wrong axis. Both sides here are computed from
        // the same declared box, so neither is a number restated from the source.
        const pen = { minX: -100, maxX: 100, minZ: -10, maxZ: 10 };
        const gate = { x: 60, z: pen.maxZ, width: 12 }; // north edge, well off centre
        const pb = new PenBarrier(pen, gate);

        const dx = Math.abs(gate.x - (pen.minX + pen.maxX) / 2);
        const dz = Math.abs(gate.z - (pen.minZ + pen.maxZ) / 2);
        expect(dx).toBeGreaterThan(dz);   // the raw-offset rule would say vertical
        expect(pb.onVertical).toBe(false); // the gap rule says horizontal, correctly

        // And it is not just a flag. The opening spans `width` ALONG the north
        // edge; under the raw-offset rule the gap runs across the pasture's whole
        // depth instead, so a sheep entering a quarter-width off the gate centre
        // is thrown back by a fence that is not there. That is the case below.
        const atGate = makeSheep(gate.x, pen.maxZ + 0.3);
        pb.update([atGate], null, true, 0.016);
        expect(atGate.position.z).toBe(pen.maxZ + 0.3); // free passage, not pushed

        const offCentre = makeSheep(gate.x + gate.width / 4, pen.maxZ + 0.3);
        pb.update([offCentre], null, true, 0.016);
        expect(offCentre.position.z).toBe(pen.maxZ + 0.3); // still inside the opening

        const offGate = makeSheep(gate.x + gate.width, pen.maxZ + 0.3);
        pb.update([offGate], null, true, 0.016);
        expect(offGate.position.z).toBeCloseTo(pen.maxZ + pb.sheepBody, 10);
    });

    it('agrees with the shipped Newsheepdogland pen on which edge holds the gate', async () => {
        // The one live square pen. Read out of the real scene module so a change
        // to the edge rule cannot quietly move the homestead gate.
        const { newsheepdogland } = await import('../shared/scenes/newsheepdogland.js');
        const pen = newsheepdogland.pen;
        const gate = newsheepdogland.gate;
        const pb = new PenBarrier(pen, { x: gate.position.x, z: gate.position.z, width: gate.width });
        expect(pb.onVertical).toBe(
            Math.abs(gate.position.x - pen.center.x) >= Math.abs(gate.position.z - pen.center.z),
        );
        expect(pb.minX).toBe(pen.center.x - pen.radius);
        expect(pb.maxZ).toBe(pen.center.z + pen.radius);
    });
});
