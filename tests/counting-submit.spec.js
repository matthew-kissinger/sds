// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// @vitest-environment jsdom
/**
 * Cycle 59 Phase 4 - the banked submit posts the counted total under the
 * curve's leaderboard mode. resolveLeaderboardMode maps state.countingCurve to
 * counting-incremental / counting-exponential; the rest of the payload (scene,
 * pausedMs window) rides the existing solo submit path unchanged.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { submitScoreToLeaderboard } from '../js/gamestate/completion.js';

function countingState(curve, overrides = {}) {
    return {
        gameMode: 'counting',
        countingCurve: curve,
        singlePlayerMode: curve, // the curve also rides singlePlayerMode
        totalSheep: 5000,
        sceneId: 'rolling-hills',
        _clientStartedAt: 1000,
        ...overrides,
    };
}

describe('Counting Sheep banked submit (Cycle 59 P4)', () => {
    let calls;
    beforeEach(() => {
        calls = [];
        window.submitGameScore = (mode, score, payload) => calls.push({ mode, score, payload });
    });
    afterEach(() => {
        delete window.submitGameScore;
        vi.restoreAllMocks();
    });

    it('posts the counted total under counting-exponential for the exponential curve', () => {
        submitScoreToLeaderboard(countingState('exponential'), 137);
        expect(calls).toHaveLength(1);
        expect(calls[0].mode).toBe('counting-exponential');
        expect(calls[0].score).toBe(137);
        expect(calls[0].payload.sceneId).toBe('rolling-hills');
        expect(calls[0].payload.gameMode).toBe('counting');
    });

    it('posts under counting-incremental for the incremental curve', () => {
        submitScoreToLeaderboard(countingState('incremental'), 42);
        expect(calls).toHaveLength(1);
        expect(calls[0].mode).toBe('counting-incremental');
        expect(calls[0].score).toBe(42);
    });

    it('falls back to singlePlayerMode when countingCurve is absent', () => {
        const state = countingState('exponential');
        delete state.countingCurve; // only singlePlayerMode carries the curve
        submitScoreToLeaderboard(state, 9);
        expect(calls[0].mode).toBe('counting-exponential');
    });

    it('still submits (counting is leaderboard-eligible, not practice-blocked)', () => {
        submitScoreToLeaderboard(countingState('incremental'), 0);
        expect(calls).toHaveLength(1);
        expect(calls[0].score).toBe(0);
    });
});
