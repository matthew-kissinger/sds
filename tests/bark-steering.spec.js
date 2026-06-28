// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Unit coverage for deterministic bark steering. Bark starts a short-lived
 * acceleration intent; it does not edit sheep velocity directly.
 */
import { describe, it, expect } from 'vitest';
import { startBarkSteering, tickBarkSteering, DEFAULT_BARK_CONFIG } from '../shared/BarkImpulse.js';

function sheepAt(x, z, vx = 0, vz = 0) {
    return {
        position: { x, z },
        velocity: { x: vx, z: vz },
        acceleration: { x: 0, z: 0 },
        state: 0,
        isRetiring: false,
        killed: false,
        dormant: false,
        isAscending: false
    };
}

const ORIGIN = { x: 0, z: 0 };
const FORWARD = { x: 0, z: 1 };

describe('startBarkSteering - deterministic bark cone', () => {
    it('exports the accepted steering config while keeping the forward cone', () => {
        expect(DEFAULT_BARK_CONFIG.range).toBe(24);
        expect(DEFAULT_BARK_CONFIG.minDot).toBeCloseTo(0.6427876096865393, 15);
        expect(DEFAULT_BARK_CONFIG.steerForce).toBe(0.22);
        expect(DEFAULT_BARK_CONFIG.durationTicks).toBe(36);
        expect(DEFAULT_BARK_CONFIG.cooldownMs).toBe(2500);
        expect(DEFAULT_BARK_CONFIG.forwardWeight).toBe(0.62);
        expect(DEFAULT_BARK_CONFIG.radialWeight).toBe(0.38);
        expect(DEFAULT_BARK_CONFIG.minFalloff).toBe(0.18);
    });

    it('starts steering for a sheep directly ahead without changing velocity', () => {
        const s = sheepAt(0, 5);
        const steered = startBarkSteering([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(steered).toBe(1);
        expect(s.velocity).toEqual({ x: 0, z: 0 });
        expect(s.barkSteerTicks).toBe(DEFAULT_BARK_CONFIG.durationTicks);
        expect(s.barkSteerX).toBeCloseTo(0, 10);
        expect(s.barkSteerZ).toBeCloseTo(1, 10);
        expect(s.barkSteerForce).toBeCloseTo(
            DEFAULT_BARK_CONFIG.steerForce * (
                DEFAULT_BARK_CONFIG.minFalloff
                + (1 - DEFAULT_BARK_CONFIG.minFalloff) * (1 - 5 / DEFAULT_BARK_CONFIG.range)
            ),
            10
        );
    });

    it('leaves sheep behind, beyond range, or outside the cone untouched', () => {
        const behind = sheepAt(0, -5);
        const far = sheepAt(0, DEFAULT_BARK_CONFIG.range + 1);
        const outsideCone = sheepAt(Math.sin(Math.PI / 3) * 4, Math.cos(Math.PI / 3) * 4);
        const steered = startBarkSteering([behind, far, outsideCone], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(steered).toBe(0);
        expect(behind.barkSteerTicks).toBeUndefined();
        expect(far.barkSteerTicks).toBeUndefined();
        expect(outsideCone.barkSteerTicks).toBeUndefined();
    });

    it('includes a sheep just inside the forward half-cone', () => {
        const s = sheepAt(Math.sin((Math.PI * 40) / 180) * 4, Math.cos((Math.PI * 40) / 180) * 4);
        const steered = startBarkSteering([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(steered).toBe(1);
        expect(s.barkSteerZ).toBeGreaterThan(0);
    });

    it('falls off with distance', () => {
        const near = sheepAt(0, 2);
        const far = sheepAt(0, 20);
        startBarkSteering([near], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        startBarkSteering([far], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(near.barkSteerForce).toBeGreaterThan(far.barkSteerForce);
    });

    it('blends dog-facing pressure with radial scatter away from the dog', () => {
        const a = sheepAt(1, 5);
        const b = sheepAt(-1, 5);
        startBarkSteering([a], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        startBarkSteering([b], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(a.barkSteerX).toBeGreaterThan(0);
        expect(b.barkSteerX).toBeLessThan(0);
        expect(a.barkSteerZ).toBeGreaterThan(0);
        expect(b.barkSteerZ).toBeGreaterThan(0);
        expect(a.barkSteerX).toBeCloseTo(-b.barkSteerX, 10);
        expect(a.barkSteerZ).toBeCloseTo(b.barkSteerZ, 10);
        expect(a.barkSteerForce).toBeCloseTo(b.barkSteerForce, 10);
    });

    it('steers along an arbitrary diagonal facing', () => {
        const f = { x: Math.SQRT1_2, z: Math.SQRT1_2 };
        const s = sheepAt(3, 3);
        const steered = startBarkSteering([s], ORIGIN, f, DEFAULT_BARK_CONFIG);
        expect(steered).toBe(1);
        expect(s.barkSteerX).toBeCloseTo(s.barkSteerZ, 10);
        expect(s.barkSteerX).toBeGreaterThan(0);
    });

    it('applies one decaying tick through acceleration only', () => {
        const s = sheepAt(0, 3, 2, -1);
        startBarkSteering([s], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        const force = s.barkSteerForce;
        const firstTick = tickBarkSteering(s);
        expect(firstTick).toBe(true);
        expect(s.velocity).toEqual({ x: 2, z: -1 });
        expect(s.acceleration.x).toBeCloseTo(0, 10);
        expect(s.acceleration.z).toBeCloseTo(force, 10);
        expect(s.barkSteerTicks).toBe(DEFAULT_BARK_CONFIG.durationTicks - 1);

        s.acceleration.z = 0;
        tickBarkSteering(s);
        expect(s.acceleration.z).toBeCloseTo(force * ((DEFAULT_BARK_CONFIG.durationTicks - 1) / DEFAULT_BARK_CONFIG.durationTicks), 10);
    });

    it('does not start steering resolved or inert sheep', () => {
        const retiring = sheepAt(0, 3);
        retiring.isRetiring = true;
        const passed = sheepAt(0, 4);
        passed.state = 1;
        const killed = sheepAt(0, 5);
        killed.killed = true;
        const ascending = sheepAt(0, 6);
        ascending.isAscending = true;
        const dormant = sheepAt(0, 7);
        dormant.dormant = true;
        expect(startBarkSteering([retiring, passed, killed, ascending, dormant], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG)).toBe(0);
    });

    it('is deterministic for identical inputs', () => {
        const make = () => [sheepAt(0, 3), sheepAt(1, 4), sheepAt(-2, 6)];
        const a = make();
        const b = make();
        startBarkSteering(a, ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        startBarkSteering(b, ORIGIN, FORWARD, DEFAULT_BARK_CONFIG);
        expect(a.map(s => ({
            ticks: s.barkSteerTicks,
            x: s.barkSteerX,
            z: s.barkSteerZ,
            force: s.barkSteerForce
        }))).toEqual(b.map(s => ({
            ticks: s.barkSteerTicks,
            x: s.barkSteerX,
            z: s.barkSteerZ,
            force: s.barkSteerForce
        })));
    });

    it('is a no-op on an empty or missing flock', () => {
        expect(startBarkSteering([], ORIGIN, FORWARD, DEFAULT_BARK_CONFIG)).toBe(0);
        expect(startBarkSteering(null, ORIGIN, FORWARD, DEFAULT_BARK_CONFIG)).toBe(0);
    });
});
