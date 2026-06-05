// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 59 Phase 1 - Counting Sheep curves, round state, id scheme, capabilities.
 *
 * Pins the dependency root the rest of the cycle builds on: the two batch
 * curves, the 5000-ceiling clamp, the shared mode-id strings (imported by both
 * client and Worker so they cannot drift), and the MODE_CAPABILITIES row that
 * drives the round-based / player-ended behavior.
 */
import { describe, it, expect } from 'vitest';
import {
    incrementalBatch,
    exponentialBatch,
    rawBatchSize,
    clampedBatchSize,
    createRoundState,
    advanceRound,
} from '../js/gamestate/countingMode.js';
import {
    COUNTING_GAME_MODE,
    COUNTING_CURVES,
    COUNTING_HARD_CEILING,
    COUNTING_LEADERBOARD_MODES,
    leaderboardModeForCurve,
    curveForLeaderboardMode,
    isCountingLeaderboardMode,
} from '../shared/countingModes.js';
import { getModeCapabilities } from '../js/gamestate/modes.js';

describe('Counting Sheep curves (Cycle 59 P1)', () => {
    it('incremental: round n spawns n sheep', () => {
        expect([1, 2, 3, 4, 5].map(incrementalBatch)).toEqual([1, 2, 3, 4, 5]);
        expect(incrementalBatch(50)).toBe(50);
        expect(incrementalBatch(0)).toBe(0);
        // rawBatchSize routes by curve name to the same function.
        expect(rawBatchSize('incremental', 7)).toBe(7);
    });

    it('exponential: round n spawns 2^(n-1) sheep', () => {
        expect([1, 2, 3, 4, 5].map(exponentialBatch)).toEqual([1, 2, 4, 8, 16]);
        expect(exponentialBatch(13)).toBe(4096); // the practical human ceiling
        expect(exponentialBatch(0)).toBe(0);
        expect(rawBatchSize('exponential', 6)).toBe(32);
    });

    it('rawBatchSize throws on an unknown curve', () => {
        expect(() => rawBatchSize('linear', 3)).toThrow(/unknown curve/);
    });
});

describe('Counting Sheep 5000-ceiling clamp (Cycle 59 P1)', () => {
    it('clamps a batch so cumulative never exceeds the ceiling', () => {
        // Exponential at the boundary: cumulative 4095 after round 12, raw round
        // 13 would be 4096 (-> 8191), clamped to land exactly on 5000.
        expect(clampedBatchSize('exponential', 13, 4095)).toBe(COUNTING_HARD_CEILING - 4095);
        // Once at the ceiling, no further batch.
        expect(clampedBatchSize('exponential', 14, 5000)).toBe(0);
    });

    it('exponential run lands cumulative on exactly 5000 then stops', () => {
        const state = createRoundState('exponential');
        let lastBatch = -1;
        let guard = 0;
        while (!state.done && guard++ < 100) lastBatch = advanceRound(state);
        expect(state.cumulative).toBe(5000);
        expect(state.done).toBe(true);
        // A further advance produces no batch.
        expect(advanceRound(state)).toBe(0);
        expect(lastBatch).toBeGreaterThan(0);
    });

    it('incremental run lands cumulative on exactly 5000 near round 99-100', () => {
        const state = createRoundState('incremental');
        let guard = 0;
        while (!state.done && guard++ < 1000) advanceRound(state);
        expect(state.cumulative).toBe(5000);
        expect(state.done).toBe(true);
        expect(state.round).toBeGreaterThanOrEqual(99);
        expect(state.round).toBeLessThanOrEqual(101);
    });

    it('advanceRound walks rounds 1,2,3 for incremental and 1,2,4 for exponential', () => {
        const inc = createRoundState('incremental');
        expect([advanceRound(inc), advanceRound(inc), advanceRound(inc)]).toEqual([1, 2, 3]);
        expect(inc.round).toBe(3);
        expect(inc.cumulative).toBe(6);

        const exp = createRoundState('exponential');
        expect([advanceRound(exp), advanceRound(exp), advanceRound(exp)]).toEqual([1, 2, 4]);
        expect(exp.cumulative).toBe(7);
    });

    it('createRoundState rejects an unknown curve', () => {
        expect(() => createRoundState('fibonacci')).toThrow(/unknown curve/);
    });
});

describe('Counting Sheep shared id scheme (Cycle 59 P1)', () => {
    it('maps each curve to its leaderboard game_mode string', () => {
        expect(leaderboardModeForCurve('incremental')).toBe('counting-incremental');
        expect(leaderboardModeForCurve('exponential')).toBe('counting-exponential');
        expect(COUNTING_LEADERBOARD_MODES).toEqual(['counting-incremental', 'counting-exponential']);
        expect(COUNTING_CURVES).toEqual(['incremental', 'exponential']);
    });

    it('round-trips a leaderboard mode back to its curve and rejects non-counting modes', () => {
        expect(curveForLeaderboardMode('counting-incremental')).toBe('incremental');
        expect(curveForLeaderboardMode('counting-exponential')).toBe('exponential');
        expect(curveForLeaderboardMode('counting-bogus')).toBeUndefined();
        expect(curveForLeaderboardMode('soloClassic')).toBeUndefined();
        expect(isCountingLeaderboardMode('counting-incremental')).toBe(true);
        expect(isCountingLeaderboardMode('soloChaos')).toBe(false);
    });
});

describe('Counting Sheep capabilities (Cycle 59 P1)', () => {
    it('reports round-based, player-ended, leaderboard-eligible caps for both curves', () => {
        // Both curves share the one 'counting' gameMode row.
        const caps = getModeCapabilities(COUNTING_GAME_MODE);
        expect(caps.submitsToLeaderboard).toBe(true);
        expect(caps.roundBased).toBe(true);
        expect(caps.autoCompletes).toBe(false);
        // Every curve resolves to the same round-based capabilities.
        for (const _curve of COUNTING_CURVES) {
            expect(getModeCapabilities(COUNTING_GAME_MODE).roundBased).toBe(true);
        }
    });

    it('leaves existing modes auto-completing and not round-based', () => {
        // Absent fields mean "default": solo still auto-completes, isn't round-based.
        const solo = getModeCapabilities('solo');
        expect(solo.roundBased).toBeUndefined();
        expect(solo.autoCompletes).toBeUndefined();
        expect(solo.submitsToLeaderboard).toBe(true);
    });
});
