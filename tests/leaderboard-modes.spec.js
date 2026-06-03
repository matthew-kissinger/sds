// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';
import { leaderboardModesForScene } from '../js/components/Multiplayer/GlobalLeaderboard.js';

const SOLO_MODES = ['soloClassic', 'soloExtreme', 'soloInsane', 'soloChaos'];

describe('leaderboardModesForScene', () => {
    it('shows solo modes for Sheep Dog Island plus its multiplayer modes', () => {
        expect(leaderboardModesForScene('rolling-hills')).toEqual([
            ...SOLO_MODES,
            'cooperative',
            'competitive',
            'timed',
        ]);
    });

    it('shows solo modes for Open Country without exposing unsupported competitive MP', () => {
        expect(leaderboardModesForScene('open-country')).toEqual([
            ...SOLO_MODES,
            'cooperative',
            'timed',
        ]);
    });

    it('keeps Home Field solo modes and all legacy multiplayer modes', () => {
        expect(leaderboardModesForScene('field')).toEqual([
            ...SOLO_MODES,
            'cooperative',
            'competitive',
            'timed',
        ]);
    });

    it('returns no modes for unknown scenes', () => {
        expect(leaderboardModesForScene('bogus')).toEqual([]);
    });
});
