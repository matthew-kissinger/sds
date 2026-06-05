// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import { leaderboardModesForScene } from '../js/components/Multiplayer/GlobalLeaderboard.js';
import { getSceneById } from '../shared/scenes/index.js';
import { getRankedCounts } from '../shared/difficulty.js';
import { COUNTING_LEADERBOARD_MODES } from '../shared/countingModes.js';

// Cycle 58: solo tabs are now per-scene ranked count tabs (`solo:<count>`),
// derived from the scene's ladder, followed by the scene's multiplayer modes.
// Derive the expected solo keys from the ladder so the test survives count
// tuning (Matt's in-browser feel-check may adjust the island numbers).
const soloKeys = (sceneId) => getRankedCounts(getSceneById(sceneId)).map((c) => `solo:${c}`);

// Cycle 59: counting-capable scenes insert the two curve boards after the solo
// rungs and before the multiplayer modes.
const counting = [...COUNTING_LEADERBOARD_MODES];

describe('leaderboardModesForScene', () => {
    it('shows per-scene solo count tabs + counting boards for Sheep Dog Island plus its multiplayer modes', () => {
        expect(leaderboardModesForScene('rolling-hills')).toEqual([
            ...soloKeys('rolling-hills'),
            ...counting,
            'cooperative',
            'competitive',
            'timed',
        ]);
        // Keeps a 200 board (the restored incident run id=16).
        expect(leaderboardModesForScene('rolling-hills')).toContain('solo:200');
    });

    it('shows solo count tabs for Open Country WITHOUT counting (it is a two-stage objective) or competitive MP', () => {
        expect(leaderboardModesForScene('open-country')).toEqual([
            ...soloKeys('open-country'),
            'cooperative',
            'timed',
        ]);
        // No counting boards leak onto Open Country.
        expect(leaderboardModesForScene('open-country')).not.toContain('counting-incremental');
        expect(leaderboardModesForScene('open-country')).not.toContain('counting-exponential');
    });

    it('keeps Home Field solo count tabs, adds counting boards, keeps all legacy multiplayer modes', () => {
        expect(leaderboardModesForScene('field')).toEqual([
            ...soloKeys('field'),
            ...counting,
            'cooperative',
            'competitive',
            'timed',
        ]);
        // The four preserved anchors are present as count tabs.
        for (const c of [200, 1000, 3000, 5000]) {
            expect(leaderboardModesForScene('field')).toContain(`solo:${c}`);
        }
        // Both counting curves present, ordered incremental then exponential.
        expect(leaderboardModesForScene('field')).toContain('counting-incremental');
        expect(leaderboardModesForScene('field')).toContain('counting-exponential');
    });

    it('returns no modes for unknown scenes', () => {
        expect(leaderboardModesForScene('bogus')).toEqual([]);
    });
});
