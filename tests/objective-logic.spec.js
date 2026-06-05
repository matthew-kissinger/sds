// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, it, expect } from 'vitest';
import { getRequiredSheep } from '../shared/ObjectiveLogic.js';

describe('getRequiredSheep', () => {
    it('returns 0 for null/undefined objective', () => {
        expect(getRequiredSheep(null, 200)).toBe(0);
        expect(getRequiredSheep(undefined, 200)).toBe(0);
    });

    it('honors explicit requiredSheep when present (legacy / opt-out)', () => {
        const obj = { requiredSheep: 40, requiredSheepFraction: 0.99, requiredSheepMin: 99 };
        expect(getRequiredSheep(obj, 200)).toBe(40);
        expect(getRequiredSheep(obj, 5000)).toBe(40);
    });

    it('scales by requiredSheepFraction when no explicit count', () => {
        const obj = { requiredSheepFraction: 0.40, requiredSheepMin: 10 };
        expect(getRequiredSheep(obj, 200)).toBe(80);
        expect(getRequiredSheep(obj, 1000)).toBe(400);
        expect(getRequiredSheep(obj, 3000)).toBe(1200);
        expect(getRequiredSheep(obj, 5000)).toBe(2000);
    });

    it('applies the requiredSheepMin floor for mid totals (>= min)', () => {
        const obj = { requiredSheepFraction: 0.40, requiredSheepMin: 10 };
        expect(getRequiredSheep(obj, 20)).toBe(10);
        expect(getRequiredSheep(obj, 25)).toBe(10);  // floor(25 * 0.4) = 10
        expect(getRequiredSheep(obj, 30)).toBe(12);  // floor(30 * 0.4) = 12
    });

    it('Cycle 58: clamps required to <= totalSheep so tiny flocks stay winnable', () => {
        const obj = { requiredSheepFraction: 0.40, requiredSheepMin: 10 };
        // Below the min floor, required is capped at the flock so the gather
        // gate is reachable (a 3-sheep Just Play run holds all 3, not 10).
        expect(getRequiredSheep(obj, 3)).toBe(3);
        expect(getRequiredSheep(obj, 5)).toBe(5);
        expect(getRequiredSheep(obj, 9)).toBe(9);
        // At the floor and above, required never exceeds the flock.
        expect(getRequiredSheep(obj, 10)).toBe(10);
        for (const total of [3, 5, 9, 10, 25, 50, 150, 600, 5000]) {
            expect(getRequiredSheep(obj, total)).toBeLessThanOrEqual(total);
        }
    });

    it('uses defaults when fraction/min absent', () => {
        const obj = { roundupZone: { x: 0, z: 0, radius: 30 }, holdRequired: 2.0 };
        // Default fraction 0.40, min 10
        expect(getRequiredSheep(obj, 200)).toBe(80);
        expect(getRequiredSheep(obj, 5)).toBe(5); // clamped to the flock
    });

    it('handles missing/zero totalSheep', () => {
        const obj = { requiredSheepFraction: 0.40, requiredSheepMin: 10 };
        expect(getRequiredSheep(obj, 0)).toBe(0); // clamp(0, max(10, 0)) = 0
        expect(getRequiredSheep(obj)).toBe(0);
    });
});
