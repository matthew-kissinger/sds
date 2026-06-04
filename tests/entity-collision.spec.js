// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import {
    resolveDogSheepCollision,
    resolveDogSheepCollisions,
    DOG_BODY_RADIUS,
    SHEEP_BODY_RADIUS,
    DOG_SHEEP_MIN_DISTANCE,
    MAX_DOG_SHEEP_PUSH_PER_TICK
} from '../shared/EntityCollision.js';

const MIN = DOG_SHEEP_MIN_DISTANCE; // 1.7

function sheepAt(x, z, vx = 0, vz = 0) {
    return { position: { x, z }, velocity: { x: vx, z: vz }, state: 0 };
}

describe('shared/EntityCollision — dog<->sheep hard separation', () => {
    it('exposes the expected body radii', () => {
        expect(DOG_BODY_RADIUS).toBeCloseTo(1.1);
        expect(SHEEP_BODY_RADIUS).toBeCloseTo(0.6);
        expect(DOG_SHEEP_MIN_DISTANCE).toBeCloseTo(1.7);
        expect(MAX_DOG_SHEEP_PUSH_PER_TICK).toBeCloseTo(0.35);
    });

    it('does nothing when the sheep is beyond the combined body radius', () => {
        const sheep = sheepAt(5, 0);
        const pushed = resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        expect(pushed).toBe(false);
        expect(sheep.position).toEqual({ x: 5, z: 0 });
    });

    it('pushes a shallowly overlapping sheep out to exactly the combined radius', () => {
        const sheep = sheepAt(1.5, 0); // overlap 0.2 < maxPush
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

    it('is a no-op for an exactly co-located sheep (no NaN)', () => {
        const sheep = sheepAt(0, 0, 0.5, 0.5);
        const pushed = resolveDogSheepCollision(sheep, { x: 0, z: 0 });
        expect(pushed).toBe(false);
        expect(Number.isFinite(sheep.position.x)).toBe(true);
        expect(Number.isFinite(sheep.position.z)).toBe(true);
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
