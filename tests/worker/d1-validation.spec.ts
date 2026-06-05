// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 27 Phase I — worker-side validation coverage.
 *
 * RoomDO + LobbyDO have a thick layer of pure validation/utility
 * functions in worker/src/d1.ts that gate score submissions. Those
 * functions had effectively zero coverage before this spec — the
 * worker either accepts or rejects, and a regression in any of them
 * would silently corrupt the leaderboard.
 *
 * Covers:
 *   - isValidGameMode: enum gate
 *   - modeSheepCountOk: cross-field plausibility
 *   - submissionScoreBoundsOk: per-mode score bounds
 *   - durationFloorForCount: minimum-plausible-duration heuristic
 *   - plausibleScoreForCount: high-level wrap
 *   - detectScoreAnomalies: clock-skew + fast-for-count soft signals
 *
 * Cycle 35 Phase 4: the natural-partition fast-path fallback was removed,
 * along with its predicate helper; the cross-scene mash-up never composed.
 * Tests for the dropped helper went with it.
 */
import { describe, it, expect } from 'vitest';
import {
    isValidGameMode,
    isDailyMode,
    isTimeMode,
    modeSheepCountOk,
    submissionScoreBoundsOk,
    durationFloorForCount,
    plausibleScoreForCount,
    detectScoreAnomalies,
    ALL_GAME_MODES,
    type GameMode,
} from '../../worker/src/d1.ts';

describe('isValidGameMode', () => {
    it('accepts every mode in ALL_GAME_MODES', () => {
        for (const mode of ALL_GAME_MODES) {
            expect(isValidGameMode(mode)).toBe(true);
        }
    });

    it('rejects unknown / arbitrary strings', () => {
        expect(isValidGameMode('soloMega')).toBe(false);
        expect(isValidGameMode('SOLOCLASSIC')).toBe(false);
        expect(isValidGameMode('')).toBe(false);
    });

    it('rejects non-string inputs', () => {
        expect(isValidGameMode(null)).toBe(false);
        expect(isValidGameMode(undefined)).toBe(false);
        expect(isValidGameMode(123)).toBe(false);
        expect(isValidGameMode({ mode: 'soloClassic' })).toBe(false);
    });
});

describe('modeSheepCountOk', () => {
    it('soloClassic accepts 200 only', () => {
        expect(modeSheepCountOk('soloClassic', 200)).toBe(true);
        expect(modeSheepCountOk('soloClassic', 199)).toBe(false);
        expect(modeSheepCountOk('soloClassic', 1000)).toBe(false);
    });

    it('soloChaos accepts 5000 only', () => {
        expect(modeSheepCountOk('soloChaos', 5000)).toBe(true);
        expect(modeSheepCountOk('soloChaos', 4999)).toBe(false);
    });

    it("'any'-allowed modes (competitive, cooperative) accept arbitrary counts", () => {
        expect(modeSheepCountOk('competitive', 50)).toBe(true);
        expect(modeSheepCountOk('cooperative', 999_999)).toBe(true);
    });
});

describe('submissionScoreBoundsOk', () => {
    it('time modes (soloClassic etc.) accept 30..3600s', () => {
        expect(submissionScoreBoundsOk('soloClassic', 30)).toBe(true);
        expect(submissionScoreBoundsOk('soloClassic', 3600)).toBe(true);
        expect(submissionScoreBoundsOk('soloClassic', 29)).toBe(false);
        expect(submissionScoreBoundsOk('soloClassic', 3601)).toBe(false);
    });

    it("'timed' mode requires integer 0..500", () => {
        expect(submissionScoreBoundsOk('timed', 0)).toBe(true);
        expect(submissionScoreBoundsOk('timed', 500)).toBe(true);
        expect(submissionScoreBoundsOk('timed', 501)).toBe(false);
        expect(submissionScoreBoundsOk('timed', 12.5)).toBe(false);
    });

    it("'competitive' is binary (0 or 1)", () => {
        expect(submissionScoreBoundsOk('competitive', 0)).toBe(true);
        expect(submissionScoreBoundsOk('competitive', 1)).toBe(true);
        expect(submissionScoreBoundsOk('competitive', 2)).toBe(false);
    });
});

describe('durationFloorForCount', () => {
    it('returns the largest matching floor for the count', () => {
        expect(durationFloorForCount(200)).toBe(30);
        expect(durationFloorForCount(1000)).toBe(90);
        expect(durationFloorForCount(3000)).toBe(180);
        expect(durationFloorForCount(5000)).toBe(240);
    });

    it('saturates at the highest tier for very large counts', () => {
        expect(durationFloorForCount(50_000)).toBe(240);
    });

    it('falls to 30s default for sub-tier counts', () => {
        expect(durationFloorForCount(50)).toBe(30);
    });
});

describe('plausibleScoreForCount', () => {
    it('passes a 35s soloClassic 200-sheep run (above 30s floor)', () => {
        expect(plausibleScoreForCount('soloClassic', 35, 200)).toBe(true);
    });

    it('rejects a 60s soloExtreme 1000-sheep run (under 90s floor)', () => {
        expect(plausibleScoreForCount('soloExtreme', 60, 1000)).toBe(false);
    });

    it('non-time modes always pass', () => {
        expect(plausibleScoreForCount('competitive', 1, 200)).toBe(true);
        expect(plausibleScoreForCount('timed', 0, 200)).toBe(true);
    });
});

describe('detectScoreAnomalies', () => {
    it('returns no anomalies for a clean soloClassic submission with no pause', () => {
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 60,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_060_000,
            pausedMs: 0,
            serverNow: 1_061_000,
        });
        expect(anomalies).toEqual([]);
    });

    it('does NOT flag a paused run whose active window matches the score (Cycle 57 P1 regression)', () => {
        // 773s wall-clock window, 14s paused -> 759s active play == claimed
        // score. Before the fix this false-flagged as client_clock_skew and
        // the run was hidden from the leaderboard. This is the real incident.
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 759,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_773_000,
            pausedMs: 14_000,
            serverNow: 1_774_000,
        });
        expect(anomalies.find((a) => a.tag === 'client_clock_skew')).toBeFalsy();
    });

    it('flags clock-skew when the active window still diverges from the claimed score by >10s', () => {
        // 80s window, 0 paused -> 80s active vs 60s claimed = 20s skew.
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 60,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_080_000,
            pausedMs: 0,
            serverNow: 1_081_000,
        });
        expect(anomalies.find((a) => a.tag === 'client_clock_skew')).toBeTruthy();
    });

    it('skips the clock-skew check entirely when pausedMs is absent (pre-Cycle-57 client)', () => {
        // Same 20s raw divergence, but no pausedMs field -> skip the check
        // rather than re-introduce the false positive for old cached clients.
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 60,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_080_000,
            serverNow: 1_081_000,
        });
        expect(anomalies.find((a) => a.tag === 'client_clock_skew')).toBeFalsy();
    });

    it('cheat guard: a forged fast score padded with a huge pausedMs still flags', () => {
        // 600s window, claims 20s, pads pausedMs=580s (>80% of window) -> no
        // pause credit -> 600s active vs 20s = 580s skew -> flagged.
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 20,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_600_000,
            pausedMs: 580_000,
            serverNow: 1_601_000,
        });
        expect(anomalies.find((a) => a.tag === 'client_clock_skew')).toBeTruthy();
    });

    it('credits a legitimate long pause within 80% of the window', () => {
        // 600s window, 120s paused (20%) -> 480s active == claimed score.
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 480,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_600_000,
            pausedMs: 120_000,
            serverNow: 1_601_000,
        });
        expect(anomalies.find((a) => a.tag === 'client_clock_skew')).toBeFalsy();
    });

    it('flags fast-for-count when score barely passes plausibility floor', () => {
        // soloExtreme floor=90, fast band threshold = 90 * 1.1 = 99.
        const anomalies = detectScoreAnomalies({
            mode: 'soloExtreme',
            score: 95,
            sheepCount: 1000,
            clientStartedAt: null,
            clientFinishedAt: null,
            serverNow: 1_061_000,
        });
        expect(anomalies.find((a) => a.tag === 'fast_for_count')).toBeTruthy();
    });
});

describe('daily-mode validation (Cycle 27 Phase D)', () => {
    it('isDailyMode accepts daily-YYYY-MM-DD', () => {
        expect(isDailyMode('daily-2026-05-08')).toBe(true);
        expect(isDailyMode('daily-2026-12-31')).toBe(true);
    });

    it('isDailyMode rejects malformed daily strings', () => {
        expect(isDailyMode('daily')).toBe(false);
        expect(isDailyMode('daily-')).toBe(false);
        expect(isDailyMode('daily-2026')).toBe(false);
        expect(isDailyMode('daily-2026-5-8')).toBe(false);
        expect(isDailyMode('Daily-2026-05-08')).toBe(false);
        expect(isDailyMode('daily-2026-05-08-extra')).toBe(false);
    });

    it('isValidGameMode accepts daily-* alongside fixed enum members', () => {
        expect(isValidGameMode('daily-2026-05-08')).toBe(true);
        expect(isValidGameMode('soloClassic')).toBe(true);
        expect(isValidGameMode('daily-bogus')).toBe(false);
    });

    it('isTimeMode classifies daily-* as time-based (lower-better)', () => {
        expect(isTimeMode('daily-2026-05-08' as GameMode)).toBe(true);
        expect(isTimeMode('competitive')).toBe(false);
    });

    it('submissionScoreBoundsOk uses time-mode bounds for daily', () => {
        expect(submissionScoreBoundsOk('daily-2026-05-08' as GameMode, 60)).toBe(true);
        expect(submissionScoreBoundsOk('daily-2026-05-08' as GameMode, 29)).toBe(false);
        expect(submissionScoreBoundsOk('daily-2026-05-08' as GameMode, 3601)).toBe(false);
    });

    it('modeSheepCountOk accepts daily counts in the seed range [50, 200]', () => {
        expect(modeSheepCountOk('daily-2026-05-08' as GameMode, 50)).toBe(true);
        expect(modeSheepCountOk('daily-2026-05-08' as GameMode, 125)).toBe(true);
        expect(modeSheepCountOk('daily-2026-05-08' as GameMode, 200)).toBe(true);
        expect(modeSheepCountOk('daily-2026-05-08' as GameMode, 49)).toBe(false);
        expect(modeSheepCountOk('daily-2026-05-08' as GameMode, 201)).toBe(false);
    });

});
