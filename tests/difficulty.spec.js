// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 58 Phase 2 — solo difficulty ladder resolver.
 *
 * Pins the per-biome ladder contract that the Worker submit allow-list (P3),
 * the leaderboard count partition (P4/P5), and the entrance + GameState wiring
 * (P6) all resolve through. The load-bearing assertion: Home Field's ranked
 * anchors stay exactly [200, 1000, 3000, 5000] so no existing leaderboard score
 * is disturbed (the new 25-sheep Quick rung is an additional, initially-empty
 * board, not a change to any existing one).
 */
import { describe, it, expect } from 'vitest';
import {
    LEGACY_SOLO_LADDER,
    getSoloLadder,
    getSoloCount,
    getRankedCounts,
    getLadderEntry,
    isRankedDifficulty,
} from '../shared/difficulty.js';
import { getSceneById, listScenes } from '../shared/scenes/index.js';
import {
    SOLO_MODE_SHEEP_COUNT,
    isExtremeBoidCount,
    isExtremeBoidMode,
} from '../js/gamestate/modes.js';

const field = getSceneById('field');
const rollingHills = getSceneById('rolling-hills');
const openCountry = getSceneById('open-country');

describe('difficulty ladder resolution (Cycle 58 P2)', () => {
    it('returns the scene ladder when declared, legacy default otherwise', () => {
        expect(getSoloLadder(field)).toBe(field.soloLadder);
        // Opt-out scene (no soloLadder) -> legacy default, byte-for-byte.
        expect(getSoloLadder({ id: 'bare' })).toBe(LEGACY_SOLO_LADDER);
        expect(getSoloLadder(null)).toBe(LEGACY_SOLO_LADDER);
        expect(getSoloLadder(undefined)).toBe(LEGACY_SOLO_LADDER);
    });

    it('resolves per-biome counts for a difficulty id', () => {
        expect(getSoloCount(field, 'classic')).toBe(200);
        expect(getSoloCount(rollingHills, 'classic')).toBe(75);
        expect(getSoloCount(openCountry, 'classic')).toBe(50);
        // Just Play is 3 everywhere now (was 30).
        expect(getSoloCount(field, 'practice')).toBe(3);
        expect(getSoloCount(rollingHills, 'practice')).toBe(3);
        expect(getSoloCount(openCountry, 'practice')).toBe(3);
    });

    it('falls back to the legacy count, then a ranked count, for an unknown id', () => {
        // A stale stored id not on the armed scene resolves to its legacy
        // default count rather than NaN.
        expect(getSoloCount(openCountry, 'insane')).toBe(3000); // legacy default for 'insane'
        // An id in no ladder at all falls back to the scene's first ranked count.
        expect(getSoloCount(openCountry, 'nonexistent-xyz')).toBe(getRankedCounts(openCountry)[0]);
    });

    it('keeps Home Field ranked anchors exactly [200, 1000, 3000, 5000]', () => {
        const hf = getRankedCounts(field);
        // The four preserved anchors are all present, in order.
        for (const c of [200, 1000, 3000, 5000]) expect(hf).toContain(c);
        // The new Quick rung (25) is the only addition; Just Play (3) is unranked.
        expect(hf).toEqual([25, 200, 1000, 3000, 5000]);
        expect(isRankedDifficulty(field, 'practice')).toBe(false);
    });

    it('legacy default ranked counts are exactly the pre-Cycle-58 set', () => {
        expect(getRankedCounts({ id: 'bare' })).toEqual([200, 1000, 3000, 5000]);
    });

    it('Rolling Hills keeps a 200 board (incident run id=16 comparability)', () => {
        expect(getRankedCounts(rollingHills)).toContain(200);
    });

    it('every biome keeps 5000 as a ranked Chaos tier and Just Play unranked', () => {
        for (const scene of listScenes()) {
            const ranked = getRankedCounts(scene);
            expect(ranked).toContain(5000);
            // Just Play (practice) present and unranked on every biome.
            const jp = getLadderEntry(scene, 'practice');
            expect(jp).toBeTruthy();
            expect(jp.ranked).toBe(false);
        }
    });

    it('SOLO_MODE_SHEEP_COUNT stays the legacy default (back-compat)', () => {
        expect(SOLO_MODE_SHEEP_COUNT).toEqual({
            practice: 30,
            classic: 200,
            extreme: 1000,
            insane: 3000,
            chaos: 5000,
        });
    });
});

describe('extreme-boid count gate (Cycle 58 P2/Q3)', () => {
    it('threshold 500 reproduces legacy Home Field id gating', () => {
        // Legacy extreme/insane/chaos counts clear it; classic/practice do not.
        expect(isExtremeBoidCount(1000)).toBe(true);
        expect(isExtremeBoidCount(3000)).toBe(true);
        expect(isExtremeBoidCount(5000)).toBe(true);
        expect(isExtremeBoidCount(200)).toBe(false);
        expect(isExtremeBoidCount(30)).toBe(false);
        // Legacy id gate agrees for the legacy counts.
        for (const e of LEGACY_SOLO_LADDER) {
            expect(isExtremeBoidCount(e.count)).toBe(isExtremeBoidMode(e.id));
        }
    });

    it('routes the islands new mid tiers correctly', () => {
        expect(isExtremeBoidCount(getSoloCount(openCountry, 'extreme'))).toBe(true); // 600
        expect(isExtremeBoidCount(getSoloCount(openCountry, 'hard'))).toBe(false); // 150
        expect(isExtremeBoidCount(getSoloCount(rollingHills, 'hard'))).toBe(false); // 200
        expect(isExtremeBoidCount(getSoloCount(rollingHills, 'extreme'))).toBe(true); // 1000
        expect(isExtremeBoidCount(25)).toBe(false);
    });
});
