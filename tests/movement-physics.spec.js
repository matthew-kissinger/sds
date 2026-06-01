import { describe, it, expect } from 'vitest';
import { Vector2D } from '../shared/Vector2D.js';
import {
    updateMovement,
    applyAcceleration,
    updateStamina,
    interpolateRotation,
    validateEntityState,
} from '../shared/MovementPhysics.js';

/**
 * Characterization tests for shared/MovementPhysics.js.
 *
 * shared/ is the deterministic-sim core (runs byte-identically on the Worker
 * DO and every client predictor), so these functions are fence-frozen. This
 * spec is READ-ONLY: it imports the real module + real Vector2D and locks the
 * CURRENT observed numbers so any future drift in the integrator, the
 * acceleration lerp, the stamina state machine, or the rotation seam handling
 * shows up as a failing test. Numbers below were captured from the live module
 * (Node, IEEE-754), not derived from intent.
 */

function makeEntity({ vx = 0, vz = 0, px = 0, pz = 0, ax = 0, az = 0 } = {}) {
    return {
        position: new Vector2D(px, pz),
        velocity: new Vector2D(vx, vz),
        acceleration: new Vector2D(ax, az),
    };
}

describe('validateEntityState', () => {
    it('resets a NaN velocity to (0,0) and reports velocity_nan', () => {
        const e = makeEntity({ vx: NaN, vz: 0, px: 1, pz: 2 });
        const r = validateEntityState(e);
        expect(r.isValid).toBe(false);
        expect(r.issues).toEqual(['velocity_nan']);
        expect(e.velocity.x).toBe(0);
        expect(e.velocity.z).toBe(0);
        // Position was finite, so it is left untouched.
        expect(e.position.x).toBe(1);
        expect(e.position.z).toBe(2);
    });

    it('also flags an Infinity velocity component (not only NaN)', () => {
        const e = makeEntity({ vx: 0, vz: Infinity });
        const r = validateEntityState(e);
        expect(r.issues).toEqual(['velocity_nan']);
        expect(e.velocity.x).toBe(0);
        expect(e.velocity.z).toBe(0);
    });

    it('snaps a NaN position to the passed fallback while zeroing velocity', () => {
        const e = makeEntity({ vx: 3, vz: 4, px: NaN, pz: 9 });
        const fallback = new Vector2D(7, 8);
        const r = validateEntityState(e, fallback);
        expect(r.isValid).toBe(false);
        expect(r.issues).toEqual(['position_nan']);
        expect(e.position.x).toBe(7);
        expect(e.position.z).toBe(8);
        // Position recovery also zeroes velocity in current behavior.
        expect(e.velocity.x).toBe(0);
        expect(e.velocity.z).toBe(0);
    });

    it('snaps the position to a *clone* of the fallback (mutating entity does not touch the fallback)', () => {
        const e = makeEntity({ px: NaN, pz: 0 });
        const fallback = new Vector2D(7, 8);
        validateEntityState(e, fallback);
        e.position.set(100, 200);
        expect(fallback.x).toBe(7);
        expect(fallback.z).toBe(8);
    });

    it('zeroes a NaN acceleration and reports acceleration_nan', () => {
        const e = makeEntity({ vx: 0, vz: 0, ax: Infinity, az: 0 });
        const r = validateEntityState(e);
        expect(r.isValid).toBe(false);
        expect(r.issues).toEqual(['acceleration_nan']);
        expect(e.acceleration.x).toBe(0);
        expect(e.acceleration.z).toBe(0);
    });

    it('returns valid/empty for clean state', () => {
        const e = makeEntity({ vx: 1, vz: 2, px: 3, pz: 4, ax: 0, az: 0 });
        const r = validateEntityState(e);
        expect(r.isValid).toBe(true);
        expect(r.issues).toEqual([]);
        // Nothing mutated.
        expect(e.velocity.x).toBe(1);
        expect(e.position.x).toBe(3);
    });

    it('treats an entity with no acceleration field as valid (acceleration check is guarded)', () => {
        const e = { position: new Vector2D(1, 2), velocity: new Vector2D(0, 0) };
        const r = validateEntityState(e);
        expect(r.isValid).toBe(true);
        expect(r.issues).toEqual([]);
    });

    it('defaults the fallback to (0,0) when none is passed', () => {
        const e = makeEntity({ px: NaN, pz: NaN });
        const r = validateEntityState(e);
        expect(r.issues).toEqual(['position_nan']);
        expect(e.position.x).toBe(0);
        expect(e.position.z).toBe(0);
    });
});

describe('applyAcceleration', () => {
    it('selects the acceleration rate when target speed > 0 and lerps by rate*dt', () => {
        // Accelerating from rest toward (1,0): diff = 1, change = 1 * 40 * 0.01 = 0.4.
        const e = makeEntity({ vx: 0, vz: 0 });
        const out = applyAcceleration(e, new Vector2D(1, 0), 0.01, {
            acceleration: 40,
            deceleration: 30,
            maxSpeed: 15,
        });
        expect(e.velocity.x).toBeCloseTo(0.4, 10);
        expect(e.velocity.z).toBeCloseTo(0, 10);
        // Returns a clone of the (mutated) velocity.
        expect(out.x).toBeCloseTo(0.4, 10);
    });

    it('selects the deceleration rate when target speed == 0', () => {
        // Decelerating toward (0,0) from (1,0): diff = -1, change = -1 * 30 * 0.01 = -0.3 -> 0.7.
        const e = makeEntity({ vx: 1, vz: 0 });
        applyAcceleration(e, new Vector2D(0, 0), 0.01, {
            acceleration: 40,
            deceleration: 30,
            maxSpeed: 15,
        });
        expect(e.velocity.x).toBeCloseTo(0.7, 10);
    });

    it('uses default config (accel 40, decel 30, maxSpeed 15) when omitted', () => {
        // From rest toward (10,0), dt 0.016: change = 10 * 40 * 0.016 = 6.4.
        const e = makeEntity({ vx: 0, vz: 0 });
        applyAcceleration(e, new Vector2D(10, 0), 0.016);
        expect(e.velocity.x).toBeCloseTo(6.4, 10);
        expect(e.velocity.magnitude()).toBeCloseTo(6.4, 10);
    });

    it('hard-caps the resulting velocity magnitude at maxSpeed', () => {
        // From (14,0), big lerp toward (100,0) would blow past 15; cap clamps to exactly 15.
        const e = makeEntity({ vx: 14, vz: 0 });
        applyAcceleration(e, new Vector2D(100, 0), 1.0, {
            acceleration: 40,
            deceleration: 30,
            maxSpeed: 15,
        });
        expect(e.velocity.magnitude()).toBeCloseTo(15, 10);
        expect(e.velocity.x).toBeCloseTo(15, 10);
    });
});

describe('updateMovement', () => {
    it('integrates and damps: accel 1.0 over dt yields the smoothed velocity and advances position', () => {
        // vel = 0 + 1 = 1; limit(1.5) no-op; *0.98 = 0.98;
        // smoothed = prev(0)*0.85 + 0.98*0.15 = 0.147; pos += 0.147.
        const e = makeEntity({ ax: 1.0 });
        const r = updateMovement(e, 0.016, {});
        expect(e.velocity.x).toBeCloseTo(0.147, 10);
        expect(e.velocity.z).toBeCloseTo(0, 10);
        expect(e.position.x).toBeCloseTo(0.147, 10);
        expect(r.speed).toBeCloseTo(0.147, 10);
        expect(r.facingDirection).toBeCloseTo(0, 10);
    });

    it('resets acceleration to zero after the step', () => {
        const e = makeEntity({ ax: 1.0, az: 0.5 });
        updateMovement(e, 0.016, {});
        expect(e.acceleration.x).toBe(0);
        expect(e.acceleration.z).toBe(0);
    });

    it('caps the post-damp velocity via maxSpeed (limit applied before damping)', () => {
        // vel = 0 + 100 = 100; limit(1.5) -> 1.5; *0.98 = 1.47;
        // smoothed = 0*0.85 + 1.47*0.15 = 0.2205.
        const e = makeEntity({ ax: 100 });
        const r = updateMovement(e, 0.016, { maxSpeed: 1.5 });
        expect(e.velocity.x).toBeCloseTo(0.2205, 10);
        expect(r.speed).toBeCloseTo(0.2205, 10);
    });

    it('below-threshold stop branch zeroes velocity, leaves position fixed, and nulls facingDirection', () => {
        // Tiny vx, no accel: smoothed = 0*0.85 + (0.0001*0.98)*0.15 ~= 1.47e-5 < 0.001 threshold.
        const e = makeEntity({ vx: 0.0001, vz: 0, px: 5, pz: 6 });
        const r = updateMovement(e, 0.016, {});
        expect(e.velocity.x).toBe(0);
        expect(e.velocity.z).toBe(0);
        expect(e.position.x).toBe(5);
        expect(e.position.z).toBe(6);
        expect(r.speed).toBe(0);
        expect(r.facingDirection).toBeNull();
    });
});

describe('updateStamina', () => {
    const dt = 1 / 60;

    it('drains when consuming + moving above the min stamina threshold', () => {
        // 100 - 30 * (1/60) = 99.5.
        const e = makeEntity({ vx: 5, vz: 0 });
        e.stamina = 100;
        const r = updateStamina(e, true, dt, {});
        expect(e.stamina).toBeCloseTo(99.5, 10);
        expect(r.current).toBeCloseTo(99.5, 10);
        expect(r.max).toBe(100);
        expect(r.percentage).toBeCloseTo(99.5, 10);
        expect(r.canConsume).toBe(true);
        expect(r.isConsuming).toBe(true);
    });

    it('does NOT drain when not moving, even if consuming (regens instead)', () => {
        // isMoving requires |velocity| > 0.1; idle dog regenerates at idle rate.
        // 50 + (20*2) * (1/60) = 50.6667.
        const e = makeEntity({ vx: 0, vz: 0 });
        e.stamina = 50;
        updateStamina(e, true, dt, {});
        expect(e.stamina).toBeCloseTo(50.6666666667, 8);
    });

    it('does NOT drain below the min threshold (regens at idle rate while moving below min)', () => {
        // stamina 5 < minStaminaToConsume 10 -> else branch; moving so regenRate (20):
        // 5 + 20 * (1/60) = 5.3333.
        const e = makeEntity({ vx: 5, vz: 0 });
        e.stamina = 5;
        const r = updateStamina(e, true, dt, {});
        expect(e.stamina).toBeCloseTo(5.3333333333, 8);
        expect(r.canConsume).toBe(false);
        expect(r.isConsuming).toBe(false);
    });

    it('regenerates faster when idle than when moving', () => {
        const moving = makeEntity({ vx: 5, vz: 0 });
        moving.stamina = 50;
        const idle = makeEntity({ vx: 0, vz: 0 });
        idle.stamina = 50;
        updateStamina(moving, false, dt, {});
        updateStamina(idle, false, dt, {});
        // moving: 50 + 20*(1/60) = 50.3333 ; idle: 50 + 40*(1/60) = 50.6667.
        expect(moving.stamina).toBeCloseTo(50.3333333333, 8);
        expect(idle.stamina).toBeCloseTo(50.6666666667, 8);
        expect(idle.stamina).toBeGreaterThan(moving.stamina);
    });

    it('clamps regen to maxStamina (no overshoot)', () => {
        const e = makeEntity({ vx: 0, vz: 0 });
        e.stamina = 99.9;
        updateStamina(e, false, 1.0, {}); // huge dt would overshoot to 139.9
        expect(e.stamina).toBe(100);
    });

    it('clamps drain to 0 (no negative stamina)', () => {
        const e = makeEntity({ vx: 5, vz: 0 });
        e.stamina = 10; // >= min so it enters the drain branch
        updateStamina(e, true, 1.0, {}); // huge dt would drive to -20
        expect(e.stamina).toBe(0);
    });
});

describe('interpolateRotation', () => {
    const inRange = (a) => a >= -Math.PI && a <= Math.PI;

    it('takes the shortest arc across the +/-PI seam rather than the long way', () => {
        // current just below +PI, target just above -PI. The naive diff is
        // ~ -6.08 (the long way through 0); normalization rewrites it to +0.1999
        // so the step moves UP toward +PI and wraps across the seam.
        const current = Math.PI - 0.1;   //  3.0416
        const target = -Math.PI + 0.1;   // -3.0416
        const out = interpolateRotation(target, current, 0.016, 12.0);
        // amount = min(1, 12*0.016) = 0.192; angleDiff normalizes to +0.1999;
        // step = +0.1999 * 0.192 ~= +0.0384; from 3.0416 -> 3.0800 (still in range).
        expect(out).toBeCloseTo(3.0799926535897932, 10);
        expect(inRange(out)).toBe(true);
        // Confirms the shortest-arc choice: it did NOT crawl back toward 0 (the
        // long way), it moved further positive toward the seam.
        expect(out).toBeGreaterThan(current);
    });

    it('reaches the target exactly when the interpolation amount saturates to 1', () => {
        const target = -Math.PI + 0.1;
        const current = Math.PI - 0.1;
        const out = interpolateRotation(target, current, 1.0, 12.0); // amount clamps to 1
        expect(out).toBeCloseTo(target, 10);
        expect(inRange(out)).toBe(true);
    });

    it('interpolates linearly when no seam is involved (full step)', () => {
        const out = interpolateRotation(1.0, 0.0, 1.0, 12.0);
        expect(out).toBeCloseTo(1.0, 10);
        expect(inRange(out)).toBe(true);
    });

    it('keeps the result within [-PI, PI] across a sweep of inputs', () => {
        const dt = 1 / 60;
        for (let t = -4; t <= 4; t += 0.37) {
            for (let c = -4; c <= 4; c += 0.53) {
                const out = interpolateRotation(t, c, dt, 12.0);
                expect(inRange(out)).toBe(true);
            }
        }
    });
});
