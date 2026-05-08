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
 *   - isNaturalPartition: leaderboard partition fall-through gate
 */
import { describe, it, expect } from 'vitest';
import {
    isValidGameMode,
    modeSheepCountOk,
    submissionScoreBoundsOk,
    durationFloorForCount,
    plausibleScoreForCount,
    detectScoreAnomalies,
    isNaturalPartition,
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
    it('returns no anomalies for a clean soloClassic submission', () => {
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 60,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_060_000,
            serverNow: 1_061_000,
        });
        expect(anomalies).toEqual([]);
    });

    it('flags clock-skew when client duration diverges from claimed score by >10s', () => {
        const anomalies = detectScoreAnomalies({
            mode: 'soloClassic',
            score: 60,
            sheepCount: 200,
            clientStartedAt: 1_000_000,
            clientFinishedAt: 1_080_000, // claims 60s but client clock says 80s
            serverNow: 1_081_000,
        });
        expect(anomalies.find((a) => a.tag === 'client_clock_skew')).toBeTruthy();
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

describe('isNaturalPartition', () => {
    it('soloClassic targeting field/200 is the natural partition', () => {
        expect(
            isNaturalPartition('soloClassic', { sceneId: 'field', sheepCount: 200 }),
        ).toBe(true);
    });

    it('soloClassic targeting any-scene defaults to natural', () => {
        expect(
            isNaturalPartition('soloClassic', { sceneId: 'any', sheepCount: 200 }),
        ).toBe(true);
    });

    it('soloClassic targeting non-canonical sheep count is NOT natural', () => {
        expect(
            isNaturalPartition('soloClassic', { sceneId: 'field', sheepCount: 999 }),
        ).toBe(false);
    });

    it('competitive has no natural partition (always returns false)', () => {
        expect(
            isNaturalPartition('competitive', { sceneId: 'field', sheepCount: 200 }),
        ).toBe(false);
    });
});
