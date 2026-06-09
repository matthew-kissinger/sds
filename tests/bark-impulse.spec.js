// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 61 Phase 4: unit coverage for the deterministic bark impulse. Asserts
 * the forward-cone shape, distance falloff, directional (non-radial) drive, the
 * range gate, and determinism - independent of the sim integration (the
 * sim-baseline bark-impulse-60hz.json fixture pins the integrated trace).
 */
import { describe, it, expect } from 'vitest';
import { applyBarkImpulse, DEFAULT_BARK_CONFIG } from '../shared/BarkImpulse.js';

// Minimal sheep stub: the impulse only reads position and mutates velocity.
function sheepAt(x, z, vx = 0, vz = 0) {
    return { position: { x, z }, velocity: { x: vx, z: vz } };
}

const ORIGIN = { x: 0, z: 0 };
const FORWARD = { x: 0, z: 1 }; // dog facing +z

describe('applyBarkImpulse - deterministic bark cone (Cycle 61 P4)', () => {
    it('exports the Medium/Long range while keeping the forward cone', () => {
        expect(DEFAULT_BARK_CONFIG.range).toBe(24);
        expect(DEFAULT_BARK_CONFIG.minDot).toBeCloseTo(0.6427876096865393, 15);
        expect(DEFAULT_BARK_CONFIG.cooldownMs).toBe(2500);
    });

    it('pushes a sheep directly ahead forward along the facing', () => {
        const s = sheepAt(0, 5);
        const pushed = applyBarkImpulse([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(pushed).toBe(1);
        expect(s.velocity.z).toBeGreaterThan(0); // driven forward
        expect(s.velocity.x).toBeCloseTo(0, 10); // no lateral drift on-axis
    });

    it('leaves a sheep directly behind the dog untouched (outside the cone)', () => {
        const s = sheepAt(0, -5);
        const pushed = applyBarkImpulse([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(pushed).toBe(0);
        expect(s.velocity.x).toBe(0);
        expect(s.velocity.z).toBe(0);
    });

    it('leaves a sheep beyond range untouched', () => {
        const s = sheepAt(0, DEFAULT_BARK_CONFIG.range + 1);
        const pushed = applyBarkImpulse([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(pushed).toBe(0);
        expect(s.velocity.z).toBe(0);
    });

    it('excludes a sheep just outside the forward half-cone (60deg > 50deg)', () => {
        const s = sheepAt(Math.sin(Math.PI / 3) * 4, Math.cos(Math.PI / 3) * 4);
        expect(applyBarkImpulse([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG)).toBe(0);
    });

    it('includes a sheep just inside the forward half-cone (40deg < 50deg)', () => {
        const s = sheepAt(Math.sin((Math.PI * 40) / 180) * 4, Math.cos((Math.PI * 40) / 180) * 4);
        const pushed = applyBarkImpulse([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(pushed).toBe(1);
        expect(s.velocity.z).toBeGreaterThan(0);
    });

    it('falls off with distance: a nearer sheep gets a stronger push', () => {
        const near = sheepAt(0, 2);
        const far = sheepAt(0, 20);
        applyBarkImpulse([near], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        applyBarkImpulse([far], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(near.velocity.z).toBeGreaterThan(far.velocity.z);
    });

    it('drives along the dog facing, not radially from the dog', () => {
        // Two laterally-offset in-cone sheep at equal distance get the SAME
        // forward push (directional drive), not a radial scatter (which would
        // differ in x and point outward).
        const a = sheepAt(1, 5);
        const b = sheepAt(-1, 5);
        applyBarkImpulse([a], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        applyBarkImpulse([b], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(a.velocity.x).toBeCloseTo(0, 10);
        expect(b.velocity.x).toBeCloseTo(0, 10);
        expect(a.velocity.z).toBeCloseTo(b.velocity.z, 10);
    });

    it('drives along an arbitrary (diagonal) facing', () => {
        const f = { x: Math.SQRT1_2, z: Math.SQRT1_2 }; // 45deg
        const s = sheepAt(3, 3); // on the diagonal
        const pushed = applyBarkImpulse([s], ORIGIN, f, DEFAULT_BARK_CONFIG);
        expect(pushed).toBe(1);
        expect(s.velocity.x).toBeGreaterThan(0);
        expect(s.velocity.z).toBeGreaterThan(0);
        expect(s.velocity.x).toBeCloseTo(s.velocity.z, 10);
    });

    it('adds to existing velocity (impulse, not assignment)', () => {
        const s = sheepAt(0, 3, 5, -2);
        applyBarkImpulse([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(s.velocity.x).toBe(5); // x unchanged (forward.x = 0)
        expect(s.velocity.z).toBeGreaterThan(-2); // z increased by the forward push
    });

    it('is deterministic: identical inputs produce identical output', () => {
        const make = () => [sheepAt(0, 3), sheepAt(1, 4), sheepAt(-2, 6)];
        const a = make();
        const b = make();
        applyBarkImpulse(a, ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        applyBarkImpulse(b, ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(a.map(s => s.velocity)).toEqual(b.map(s => s.velocity));
    });

    it('is a no-op on an empty or missing flock', () => {
        expect(applyBarkImpulse([], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG)).toBe(0);
        expect(applyBarkImpulse(null, ORIGIN, FORWARD, DEFAULT_BARK_CONFIG)).toBe(0);
    });
});
