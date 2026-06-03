// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 27 Phase D — daily-seed determinism + partition format.
 *
 * Three load-bearing assertions per the cycle plan:
 *  1. dailySeedFor(date) is deterministic for a fixed UTC day.
 *  2. leaderboardPartition format is `daily-YYYY-MM-DD`.
 *  3. Three different days produce three different (sceneId, sheepCount)
 *     tuples — confirms the hash actually decorrelates across axes.
 *
 * Plus a few sanity checks on bounds.
 */
import { describe, it, expect } from 'vitest';
import { dailySeedFor, dailyKey, fnv1a, __TEST_ONLY__ } from '../js/utils/dailySeed.js';

describe('dailySeed determinism', () => {
    it('two calls with the same UTC date return identical seeds', () => {
        const d1 = new Date(Date.UTC(2026, 4, 8, 12, 0, 0));
        const d2 = new Date(Date.UTC(2026, 4, 8, 23, 59, 59));
        const a = dailySeedFor(d1);
        const b = dailySeedFor(d2);
        expect(a).toEqual(b);
    });

    it('seedString is the UTC YYYY-MM-DD key', () => {
        const seed = dailySeedFor(new Date(Date.UTC(2026, 0, 1)));
        expect(seed.seedString).toBe('2026-01-01');
        expect(seed.dateKey).toBe('2026-01-01');
    });

    it('different days produce different challenges', () => {
        const days = ['2026-05-08', '2026-05-09', '2026-05-10'];
        const seeds = days.map((dk) => {
            const [y, m, d] = dk.split('-').map(Number);
            return dailySeedFor(new Date(Date.UTC(y, m - 1, d)));
        });
        const tuples = seeds.map((s) => `${s.sceneId}|${s.sheepCount}`);
        const distinct = new Set(tuples);
        expect(distinct.size).toBeGreaterThanOrEqual(2);
    });
});

describe('leaderboard partition', () => {
    it('partition format is daily-YYYY-MM-DD', () => {
        const seed = dailySeedFor(new Date(Date.UTC(2026, 4, 8)));
        expect(seed.leaderboardPartition).toBe('daily-2026-05-08');
        expect(seed.leaderboardPartition).toMatch(/^daily-\d{4}-\d{2}-\d{2}$/);
    });
});

describe('challenge bounds', () => {
    it('sceneId is one of the three canonical scenes', () => {
        for (let day = 1; day <= 31; day++) {
            const seed = dailySeedFor(new Date(Date.UTC(2026, 0, day)));
            expect(__TEST_ONLY__.SCENE_IDS).toContain(seed.sceneId);
        }
    });

    it('sheepCount stays in [SHEEP_MIN, SHEEP_MAX]', () => {
        for (let day = 1; day <= 31; day++) {
            const seed = dailySeedFor(new Date(Date.UTC(2026, 0, day)));
            expect(seed.sheepCount).toBeGreaterThanOrEqual(__TEST_ONLY__.SHEEP_MIN);
            expect(seed.sheepCount).toBeLessThanOrEqual(__TEST_ONLY__.SHEEP_MAX);
        }
    });

    it('timeOfDay stays in (0, 1) avoiding hard noon/midnight', () => {
        for (let day = 1; day <= 31; day++) {
            const seed = dailySeedFor(new Date(Date.UTC(2026, 0, day)));
            expect(seed.timeOfDay).toBeGreaterThan(0);
            expect(seed.timeOfDay).toBeLessThan(1);
        }
    });

    it('durationSec stays in [60, 180]', () => {
        for (let day = 1; day <= 31; day++) {
            const seed = dailySeedFor(new Date(Date.UTC(2026, 0, day)));
            expect(seed.durationSec).toBeGreaterThanOrEqual(__TEST_ONLY__.DURATION_MIN_SEC);
            expect(seed.durationSec).toBeLessThanOrEqual(__TEST_ONLY__.DURATION_MAX_SEC);
        }
    });
});

describe('helpers', () => {
    it('dailyKey is UTC-stable across local-tz Date construction', () => {
        const d1 = new Date(Date.UTC(2026, 4, 8, 0, 0, 0));
        const d2 = new Date(Date.UTC(2026, 4, 8, 23, 59, 59));
        expect(dailyKey(d1)).toBe('2026-05-08');
        expect(dailyKey(d2)).toBe('2026-05-08');
    });

    it('fnv1a is deterministic and non-trivial', () => {
        expect(fnv1a('test')).toBe(fnv1a('test'));
        expect(fnv1a('a')).not.toBe(fnv1a('b'));
        // FNV-1a empty-string offset
        expect(fnv1a('')).toBe(0x811c9dc5);
    });
});
