// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { Vector2D } from '../shared/Vector2D.js';
import {
    calculateSeparation,
    calculateAlignment,
    calculateCohesion,
    calculateSeek,
    calculateFlockingForce,
} from '../shared/FlockingAlgorithms.js';

/**
 * Characterization tests for shared/FlockingAlgorithms.js component functions
 * in isolation. These lock the CURRENT actual behavior of the deterministic
 * boid primitives (read-only; no source edits). shared/ is a fence-frozen
 * deterministic-sim module — importing to assert is allowed.
 *
 * Tuning constants used below (chosen so maxSpeed > maxForce, which is the
 * real configuration shape: a unit*maxSpeed steering vector minus a zero
 * velocity exceeds maxForce, so the limiter clamps the magnitude to maxForce).
 */
const MAX_SPEED = 1.5;
const MAX_FORCE = 0.05;

/** Make a boid at (x, z) with the given velocity (defaults to rest). */
function boid(x, z, vx = 0, vz = 0) {
    return { position: new Vector2D(x, z), velocity: new Vector2D(vx, vz) };
}

describe('calculateSeparation', () => {
    it('steers directly away from a single in-range neighbor', () => {
        // Boid at origin, neighbor to the +x side at distance 1 (< desiredSeparation 2).
        const me = boid(0, 0);
        const neighbors = [boid(1, 0)];

        const steer = calculateSeparation(me, neighbors, 2.0, MAX_SPEED, MAX_FORCE);

        // Away from neighbor == toward -x.
        expect(steer.x).toBeLessThan(0);
        expect(steer.z).toBeCloseTo(0, 10);
        // Direction is purely -x (atan2 == PI).
        expect(steer.angle()).toBeCloseTo(Math.PI, 10);
    });

    it('clamps the separation steer magnitude to maxForce (rest boid)', () => {
        const me = boid(0, 0);
        const neighbors = [boid(1, 0)];

        const steer = calculateSeparation(me, neighbors, 2.0, MAX_SPEED, MAX_FORCE);

        // unit(away)*maxSpeed - velocity(0) has magnitude maxSpeed > maxForce,
        // so limit() pins it to exactly maxForce.
        expect(steer.magnitude()).toBeCloseTo(MAX_FORCE, 10);
    });

    it('ignores a coincident (distance-0) neighbor, returning zero steer', () => {
        const me = boid(0, 0);
        // Neighbor at the exact same position -> distance 0 -> guarded out.
        const neighbors = [boid(0, 0, 0.7, -0.3)];

        const steer = calculateSeparation(me, neighbors, 2.0, MAX_SPEED, MAX_FORCE);

        // count stays 0, so the steer is the untouched zero vector.
        expect(steer.x).toBe(0);
        expect(steer.z).toBe(0);
        expect(steer.magnitude()).toBe(0);
    });

    it('returns zero steer when the only neighbor is outside desiredSeparation', () => {
        const me = boid(0, 0);
        // Distance 5 > desiredSeparation 2 -> not counted.
        const neighbors = [boid(5, 0)];

        const steer = calculateSeparation(me, neighbors, 2.0, MAX_SPEED, MAX_FORCE);

        expect(steer.x).toBe(0);
        expect(steer.z).toBe(0);
    });
});

describe('calculateAlignment', () => {
    it('steers toward +x when all neighbors move +x', () => {
        const me = boid(0, 0); // at rest
        const neighbors = [boid(10, 0, 1, 0), boid(-10, 5, 2, 0)];

        const steer = calculateAlignment(me, neighbors, MAX_SPEED, MAX_FORCE);

        // Average heading is +x; desired == (maxSpeed,0); minus rest velocity;
        // limited to maxForce -> (maxForce, 0).
        expect(steer.x).toBeGreaterThan(0);
        expect(steer.z).toBeCloseTo(0, 10);
        expect(steer.angle()).toBeCloseTo(0, 10);
        expect(steer.magnitude()).toBeCloseTo(MAX_FORCE, 10);
    });

    it('does not mutate the input boid velocity', () => {
        const me = boid(0, 0, 0, 0);
        const neighbors = [boid(1, 1, 1, 0)];

        calculateAlignment(me, neighbors, MAX_SPEED, MAX_FORCE);

        expect(me.velocity.x).toBe(0);
        expect(me.velocity.z).toBe(0);
    });
});

describe('calculateCohesion', () => {
    it('seeks the centroid of the neighbors', () => {
        // Two neighbors -> centroid at (4, 0), straight +x of the boid at origin.
        const me = boid(0, 0);
        const neighbors = [boid(2, 0), boid(6, 0)];

        const steer = calculateCohesion(me, neighbors, MAX_SPEED, MAX_FORCE);

        // Seek toward centroid (+x), limited to maxForce.
        expect(steer.x).toBeGreaterThan(0);
        expect(steer.z).toBeCloseTo(0, 10);
        expect(steer.angle()).toBeCloseTo(0, 10);
        expect(steer.magnitude()).toBeCloseTo(MAX_FORCE, 10);
    });

    it('matches calculateSeek toward the average neighbor position', () => {
        const me = boid(1, 2);
        const neighbors = [boid(5, 2), boid(5, 6), boid(-3, 4)];

        // Manually compute centroid: ((5+5-3)/3, (2+6+4)/3) = (7/3, 4).
        const centroid = new Vector2D((5 + 5 - 3) / 3, (2 + 6 + 4) / 3);
        const expected = calculateSeek(boid(1, 2), centroid, MAX_SPEED, MAX_FORCE);

        const steer = calculateCohesion(me, neighbors, MAX_SPEED, MAX_FORCE);

        expect(steer.x).toBeCloseTo(expected.x, 12);
        expect(steer.z).toBeCloseTo(expected.z, 12);
    });
});

describe('calculateSeek', () => {
    it('clamps to maxForce, pointing toward an offset target (rest boid)', () => {
        const me = boid(0, 0);
        const target = new Vector2D(10, 0); // offset along +x

        const steer = calculateSeek(me, target, MAX_SPEED, MAX_FORCE);

        // desired == unit(+x)*maxSpeed; minus rest velocity; limited to maxForce.
        expect(steer.angle()).toBeCloseTo(0, 10);
        expect(steer.z).toBeCloseTo(0, 10);
        expect(steer.magnitude()).toBeCloseTo(MAX_FORCE, 10);
    });

    it('points toward a diagonal target and stays clamped to maxForce', () => {
        const me = boid(0, 0);
        const target = new Vector2D(3, 3); // 45 degrees

        const steer = calculateSeek(me, target, MAX_SPEED, MAX_FORCE);

        expect(steer.angle()).toBeCloseTo(Math.PI / 4, 10);
        expect(steer.magnitude()).toBeCloseTo(MAX_FORCE, 10);
        // Equal components on the diagonal.
        expect(steer.x).toBeCloseTo(steer.z, 10);
    });

    it('does not mutate the target vector', () => {
        const me = boid(0, 0);
        const target = new Vector2D(10, 0);

        calculateSeek(me, target, MAX_SPEED, MAX_FORCE);

        expect(target.x).toBe(10);
        expect(target.z).toBe(0);
    });
});

describe('calculateFlockingForce', () => {
    it('returns a zero vector for an empty neighbor list (empty-neighbors guard)', () => {
        const me = boid(0, 0, 0.4, 0.4);

        const force = calculateFlockingForce(me, [], {});

        expect(force).toBeInstanceOf(Vector2D);
        expect(force.x).toBe(0);
        expect(force.z).toBe(0);
        expect(force.magnitude()).toBe(0);
    });

    it('returns a non-zero, weighted combined force when neighbors are present', () => {
        // One crowding neighbor close on +x: separation should dominate toward -x.
        const me = boid(0, 0);
        const neighbors = [boid(1, 0, 1, 0)];

        const force = calculateFlockingForce(me, neighbors, {
            separationDistance: 2.0,
            separationWeight: 1.5,
            alignmentWeight: 1.0,
            cohesionWeight: 1.0,
            maxSpeed: MAX_SPEED,
            maxForce: MAX_FORCE,
        });

        // Combined force is the weighted sum of the three component forces; it is
        // not the zero guard vector.
        expect(force.magnitude()).toBeGreaterThan(0);
    });
});
