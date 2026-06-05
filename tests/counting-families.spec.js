// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 59 Phase 7 - entrance mode-family taxonomy.
 *
 * familiesForWorld is the single source the entrance reads to build its family
 * selector: Home Field + Rolling Hills offer Classic (solo) and Counting Sheep
 * (the two curves); Open Country is a two-stage objective, so it carries a lone
 * Objective family and no counting.
 */
import { describe, it, expect } from 'vitest';
import { familiesForWorld, modesForWorld } from '../js/components/entrance/worlds.ts';
import { COUNTING_GAME_MODE } from '../shared/countingModes.js';

describe('familiesForWorld (Cycle 59 P7)', () => {
    it('Home Field offers Solo then Counting Sheep (counting)', () => {
        const fams = familiesForWorld('field');
        expect(fams.map((f) => f.id)).toEqual(['solo', COUNTING_GAME_MODE]);
        expect(fams[0].gameMode).toBe('solo');
        expect(fams[1].gameMode).toBe(COUNTING_GAME_MODE);
        // Classic rungs are the scene's solo ladder.
        expect(fams[0].rungs.map((r) => r.id)).toEqual(modesForWorld('field').map((r) => r.id));
        // Counting rungs are the two curves, in order.
        expect(fams[1].rungs.map((r) => r.id)).toEqual(['incremental', 'exponential']);
    });

    it('Rolling Hills also offers Solo + Counting Sheep', () => {
        const fams = familiesForWorld('rolling-hills');
        expect(fams.map((f) => f.id)).toEqual(['solo', COUNTING_GAME_MODE]);
        expect(fams[1].rungs.map((r) => r.id)).toEqual(['incremental', 'exponential']);
    });

    it('Open Country carries a single Objective family and no counting', () => {
        const fams = familiesForWorld('open-country');
        expect(fams.map((f) => f.id)).toEqual(['objective']);
        expect(fams[0].gameMode).toBe('solo');
        expect(fams.some((f) => f.gameMode === COUNTING_GAME_MODE)).toBe(false);
        // Its rungs are the OC solo ladder (the relabel, no gameplay change).
        expect(fams[0].rungs.map((r) => r.id)).toEqual(modesForWorld('open-country').map((r) => r.id));
    });

    it('counting curve rungs carry a hint blurb and the 5000 ceiling, ranked', () => {
        const counting = familiesForWorld('field')[1];
        for (const rung of counting.rungs) {
            expect(rung.sheep).toBe(5000);
            expect(rung.ranked).toBe(true);
            expect(typeof rung.blurb).toBe('string');
            expect(rung.blurb.length).toBeGreaterThan(0);
        }
    });
});
