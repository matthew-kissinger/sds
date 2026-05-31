import { describe, it, expect } from 'vitest';
import { Vector2D } from '../shared/Vector2D.js';

// Characterization tests: assert the CURRENT actual behavior of shared/Vector2D.js
// so it stays locked. Vector2D is a deterministic-sim primitive (fence-frozen);
// these tests only import + read it.

describe('Vector2D.normalize', () => {
    it('collapses a sub-epsilon vector to (0,0) rather than NaN', () => {
        // magnitude (1e-7) is below the 0.00001 epsilon guard, so the branch
        // zeroes the components instead of dividing by a tiny length.
        const v = new Vector2D(1e-7, 0);
        v.normalize();
        expect(v.x).toBe(0);
        expect(v.z).toBe(0);
        expect(Number.isNaN(v.x)).toBe(false);
        expect(Number.isNaN(v.z)).toBe(false);
    });

    it('zeroes an exact zero vector (no division by zero)', () => {
        const v = new Vector2D(0, 0);
        v.normalize();
        expect(v.x).toBe(0);
        expect(v.z).toBe(0);
    });

    it('normalizes (3,4) to (0.6,0.8)', () => {
        const v = new Vector2D(3, 4);
        v.normalize();
        expect(v.x).toBe(0.6);
        expect(v.z).toBe(0.8);
        expect(v.magnitude()).toBeCloseTo(1, 12);
    });

    it('returns this for chaining', () => {
        const v = new Vector2D(3, 4);
        expect(v.normalize()).toBe(v);
    });
});

describe('Vector2D.divide', () => {
    it('is a no-op when dividing by 0 (guard leaves components untouched)', () => {
        const v = new Vector2D(3, 4);
        const result = v.divide(0);
        expect(v.x).toBe(3);
        expect(v.z).toBe(4);
        expect(result).toBe(v); // still returns this
    });

    it('divides components by a nonzero scalar', () => {
        const v = new Vector2D(6, 8);
        v.divide(2);
        expect(v.x).toBe(3);
        expect(v.z).toBe(4);
    });
});

describe('Vector2D.limit', () => {
    it('scales a vector whose magnitude is above max down to exactly max', () => {
        const v = new Vector2D(3, 4); // magnitude 5
        v.limit(2.5);
        expect(v.x).toBe(1.5);
        expect(v.z).toBe(2);
        expect(v.magnitude()).toBe(2.5);
    });

    it('leaves a vector below max untouched', () => {
        const v = new Vector2D(0.3, 0.4); // magnitude 0.5
        v.limit(2.5);
        expect(v.x).toBe(0.3);
        expect(v.z).toBe(0.4);
    });

    it('leaves a vector exactly at max untouched (strict greater-than guard)', () => {
        const v = new Vector2D(3, 4); // magnitude exactly 5
        v.limit(5);
        expect(v.x).toBe(3);
        expect(v.z).toBe(4);
    });
});

describe('Vector2D.magnitude / distanceTo', () => {
    it('magnitude of a 3-4-5 triangle is 5', () => {
        expect(new Vector2D(3, 4).magnitude()).toBe(5);
    });

    it('distanceTo across a 3-4-5 triangle is 5', () => {
        const origin = new Vector2D(0, 0);
        expect(origin.distanceTo(new Vector2D(3, 4))).toBe(5);
    });

    it('distanceTo is symmetric and offset-invariant', () => {
        const a = new Vector2D(1, 1);
        const b = new Vector2D(4, 5);
        expect(a.distanceTo(b)).toBe(5);
        expect(b.distanceTo(a)).toBe(5);
    });
});

describe('Vector2D.angle / fromAngle', () => {
    it('angle() of (3,4) matches atan2(z,x)', () => {
        expect(new Vector2D(3, 4).angle()).toBe(Math.atan2(4, 3));
    });

    it('fromAngle -> angle round-trips for several angles', () => {
        for (const ang of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, -Math.PI / 4, 2.5]) {
            const v = Vector2D.fromAngle(ang);
            // fromAngle stores x=cos, z=sin; angle() = atan2(z,x) recovers it.
            expect(v.angle()).toBeCloseTo(ang, 12);
        }
    });

    it('fromAngle produces a unit vector', () => {
        const v = Vector2D.fromAngle(1.234);
        expect(v.magnitude()).toBeCloseTo(1, 12);
    });
});

describe('Vector2D.clone', () => {
    it('returns a deep copy with equal components but a distinct instance', () => {
        const original = new Vector2D(1, 2);
        const copy = original.clone();
        expect(copy).not.toBe(original);
        expect(copy.x).toBe(original.x);
        expect(copy.z).toBe(original.z);
    });

    it('mutating the clone does not affect the original', () => {
        const original = new Vector2D(1, 2);
        const copy = original.clone();
        copy.x = 99;
        copy.z = -7;
        expect(original.x).toBe(1);
        expect(original.z).toBe(2);
    });
});
