// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import {
    resolveDogSheepCollision,
    resolveDogSheepCollisions,
    createSheepCollisionScratch,
    resolveSheepSheepCollisions,
    DOG_BODY_RADIUS,
    SHEEP_BODY_RADIUS,
    DOG_SHEEP_MIN_DISTANCE,
    SHEEP_SHEEP_MIN_DISTANCE,
    MAX_DOG_SHEEP_PUSH_PER_TICK,
    MAX_SHEEP_SHEEP_PUSH_PER_TICK
} from '../shared/EntityCollision.js';

const MIN = DOG_SHEEP_MIN_DISTANCE;

function sheepAt(x, z, vx = 0, vz = 0) {
    return { position: { x, z }, velocity: { x: vx, z: vz }, state: 0 };
}

describe('shared/EntityCollision — dog<->sheep hard separation', () => {
    it('exposes the expected body radii', () => {
        expect(DOG_BODY_RADIUS).toBeCloseTo(1.2);
        expect(SHEEP_BODY_RADIUS).toBeCloseTo(0.78);
        expect(DOG_SHEEP_MIN_DISTANCE).toBeCloseTo(1.98);
        expect(SHEEP_SHEEP_MIN_DISTANCE).toBeCloseTo(1.35);
        expect(MAX_DOG_SHEEP_PUSH_PER_TICK).toBeCloseTo(0.42);
        expect(MAX_SHEEP_SHEEP_PUSH_PER_TICK).toBeCloseTo(0.14);
    });

    it('does nothing when the sheep is beyond the combined body radius', () => {
        const sheep = sheepAt(5, 0);
        const pushed = resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        expect(pushed).toBe(false);
        expect(sheep.position).toEqual({ x: 5, z: 0 });
    });

    it('pushes a shallowly overlapping sheep out to exactly the combined radius', () => {
        const sheep = sheepAt(1.8, 0); // overlap 0.18 < maxPush
        const pushed = resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        expect(pushed).toBe(true);
        // pushed along +x normal to the min distance
        expect(sheep.position.x).toBeCloseTo(MIN, 6);
        expect(sheep.position.z).toBeCloseTo(0, 6);
        const dist = Math.hypot(sheep.position.x, sheep.position.z);
        expect(dist).toBeCloseTo(MIN, 6);
    });

    it('caps the correction at MAX_DOG_SHEEP_PUSH_PER_TICK for a deep overlap', () => {
        const sheep = sheepAt(0.1, 0); // overlap 1.6, capped to 0.35
        resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        expect(sheep.position.x).toBeCloseTo(0.1 + MAX_DOG_SHEEP_PUSH_PER_TICK, 6);
    });

    it('removes the velocity component pointing into the dog', () => {
        const sheep = sheepAt(1.0, 0, -1, 0); // moving straight at the dog
        resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        // inward (-x) component removed; sheep no longer drives into the dog
        expect(sheep.velocity.x).toBeCloseTo(0, 6);
        expect(sheep.velocity.z).toBeCloseTo(0, 6);
    });

    it('keeps a velocity component moving away from the dog untouched', () => {
        const sheep = sheepAt(1.0, 0, 2, 0); // already moving away (+x)
        resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        expect(sheep.velocity.x).toBeCloseTo(2, 6); // unchanged
    });

    it('uses a deterministic finite fallback for an exactly co-located dog overlap', () => {
        const sheep = sheepAt(0, 0, 0.5, 0.5);
        const pushed = resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        expect(pushed).toBe(true);
        expect(Number.isFinite(sheep.position.x)).toBe(true);
        expect(Number.isFinite(sheep.position.z)).toBe(true);
        expect(Math.hypot(sheep.position.x, sheep.position.z)).toBeCloseTo(MAX_DOG_SHEEP_PUSH_PER_TICK);
    });

    it('is deterministic — identical inputs produce identical output', () => {
        const a = sheepAt(0.8, 0.3, -0.4, 0.1);
        const b = sheepAt(0.8, 0.3, -0.4, 0.1);
        resolveDogSheepCollision(a, { x: 0, z: 0 });
        resolveDogSheepCollision(b, { x: 0, z: 0 });
        expect(a.position).toEqual(b.position);
        expect(a.velocity).toEqual(b.velocity);
    });

    it('resolveDogSheepCollisions pushes out of the nearest overlapping dog across an iterable', () => {
        const sheep = sheepAt(0.5, 0);
        const dogs = [{ position: { x: 0, z: 0 } }, { position: { x: 50, z: 50 } }];
        const pushed = resolveDogSheepCollisions(sheep, dogs);
        expect(pushed).toBe(true);
        // separated from the near dog at origin
        expect(Math.hypot(sheep.position.x, sheep.position.z)).toBeGreaterThan(0.5);
    });

    it('resolveDogSheepCollisions tolerates empty / null dog sets', () => {
        const sheep = sheepAt(0.5, 0);
        expect(resolveDogSheepCollisions(sheep, [])).toBe(false);
        expect(resolveDogSheepCollisions(sheep, null)).toBe(false);
        expect(sheep.position).toEqual({ x: 0.5, z: 0 });
    });
});

describe('shared/EntityCollision — sheep<->sheep hard separation', () => {
    it('does nothing when active sheep are outside the hard-body radius', () => {
        const sheep = [sheepAt(0, 0), sheepAt(SHEEP_SHEEP_MIN_DISTANCE + 0.1, 0)];
        const result = resolveSheepSheepCollisions(sheep);
        expect(result.pairs).toBe(0);
        expect(result.moved).toBe(0);
        expect(sheep[0].position).toEqual({ x: 0, z: 0 });
        expect(sheep[1].position).toEqual({ x: SHEEP_SHEEP_MIN_DISTANCE + 0.1, z: 0 });
    });

    it('separates overlapping active sheep symmetrically with a capped correction', () => {
        const sheep = [sheepAt(0, 0), sheepAt(1.2, 0)];
        const result = resolveSheepSheepCollisions(sheep);
        expect(result.pairs).toBe(1);
        expect(result.moved).toBe(2);
        expect(sheep[0].position.x).toBeCloseTo(-0.075, 6);
        expect(sheep[1].position.x).toBeCloseTo(1.275, 6);
        expect(Math.hypot(
            sheep[0].position.x - sheep[1].position.x,
            sheep[0].position.z - sheep[1].position.z
        )).toBeCloseTo(SHEEP_SHEEP_MIN_DISTANCE, 6);
    });

    it('caps deep-overlap movement per sheep', () => {
        const sheep = [sheepAt(0, 0), sheepAt(0.05, 0)];
        resolveSheepSheepCollisions(sheep);
        expect(Math.hypot(sheep[0].position.x, sheep[0].position.z))
            .toBeLessThanOrEqual(MAX_SHEEP_SHEEP_PUSH_PER_TICK + 1e-9);
        expect(Math.hypot(sheep[1].position.x - 0.05, sheep[1].position.z))
            .toBeLessThanOrEqual(MAX_SHEEP_SHEEP_PUSH_PER_TICK + 1e-9);
    });

    it('removes relative velocity moving sheep into each other', () => {
        const sheep = [sheepAt(0, 0, 1, 0), sheepAt(1.2, 0, -1, 0)];
        resolveSheepSheepCollisions(sheep);
        const rel = (sheep[0].velocity.x - sheep[1].velocity.x);
        expect(rel).toBeGreaterThanOrEqual(-1e-9);
    });

    it('uses a deterministic finite fallback for exactly co-located sheep', () => {
        const a = [sheepAt(0, 0), sheepAt(0, 0)];
        const b = [sheepAt(0, 0), sheepAt(0, 0)];
        a[0].id = 1;
        a[1].id = 2;
        b[0].id = 1;
        b[1].id = 2;
        resolveSheepSheepCollisions(a);
        resolveSheepSheepCollisions(b);
        expect(a[0].position).toEqual(b[0].position);
        expect(a[1].position).toEqual(b[1].position);
        expect(Number.isFinite(a[0].position.x)).toBe(true);
        expect(Number.isFinite(a[0].position.z)).toBe(true);
    });

    it('ignores non-active sheep', () => {
        const sheep = [sheepAt(0, 0), sheepAt(0.5, 0)];
        sheep[1].state = 1;
        const result = resolveSheepSheepCollisions(sheep);
        expect(result.pairs).toBe(0);
        expect(result.moved).toBe(0);
    });

    it('reuses caller scratch and reports moved indices', () => {
        const scratch = createSheepCollisionScratch();
        const sheep = [sheepAt(0, 0), sheepAt(1.2, 0), sheepAt(10, 0)];
        const result = resolveSheepSheepCollisions(sheep, { scratch });
        expect(result.moved).toBe(2);
        expect(scratch.movedIndices).toEqual([0, 1]);
    });

    it('bounds pair checks with the spatial grid at flock scale', () => {
        const sheep = [];
        const spacing = SHEEP_SHEEP_MIN_DISTANCE * 2.2;
        for (let i = 0; i < 5000; i++) {
            sheep.push(sheepAt((i % 100) * spacing, Math.floor(i / 100) * spacing));
        }
        const result = resolveSheepSheepCollisions(sheep);
        const allPairs = sheep.length * (sheep.length - 1) / 2;
        expect(result.pairChecks).toBeLessThan(allPairs / 100);
        expect(result.moved).toBe(0);
    });
});
