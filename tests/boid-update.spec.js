// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger

import { describe, expect, it } from 'vitest';

import { Boid } from '../js/Boid.js';

describe('Boid allocation-free integration', () => {
    it('preserves the characterized position and velocity update', () => {
        const boid = new Boid(1, -2, { maxSpeed: 1.5, maxForce: 0.05 });
        const velocity = boid.velocity;
        const previousVelocity = boid.previousVelocity;
        boid.velocity.set(0.2, -0.1);
        boid.acceleration.set(0.01, 0.02);
        boid.forceAccumulator.set(0.03, -0.04);

        boid.update(1 / 60);

        expect(boid.position).toMatchObject({ x: 1.492672, z: -2.246336 });
        expect(boid.velocity).toMatchObject({ x: 0.20528000000000002, z: -0.10264000000000001 });
        expect(Math.abs(boid.acceleration.x)).toBe(0);
        expect(Math.abs(boid.acceleration.z)).toBe(0);
        expect(Math.abs(boid.forceAccumulator.x)).toBe(0);
        expect(Math.abs(boid.forceAccumulator.z)).toBe(0);
        expect(boid.previousVelocity).toMatchObject({ x: 0.2, z: -0.1 });
        expect(boid.velocity).toBe(velocity);
        expect(boid.previousVelocity).toBe(previousVelocity);
    });
});
