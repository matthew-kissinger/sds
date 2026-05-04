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

    it('clamps to requiredSheepMin floor for tiny totals', () => {
        const obj = { requiredSheepFraction: 0.40, requiredSheepMin: 10 };
        expect(getRequiredSheep(obj, 5)).toBe(10);
        expect(getRequiredSheep(obj, 20)).toBe(10);
        expect(getRequiredSheep(obj, 25)).toBe(10);  // floor(25 * 0.4) = 10
        expect(getRequiredSheep(obj, 30)).toBe(12);  // floor(30 * 0.4) = 12
    });

    it('uses defaults when fraction/min absent', () => {
        const obj = { roundupZone: { x: 0, z: 0, radius: 30 }, holdRequired: 2.0 };
        // Default fraction 0.40, min 10
        expect(getRequiredSheep(obj, 200)).toBe(80);
        expect(getRequiredSheep(obj, 5)).toBe(10);
    });

    it('handles missing/zero totalSheep', () => {
        const obj = { requiredSheepFraction: 0.40, requiredSheepMin: 10 };
        expect(getRequiredSheep(obj, 0)).toBe(10);
        expect(getRequiredSheep(obj)).toBe(10);
    });
});
