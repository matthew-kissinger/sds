// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { describe, expect, it } from 'vitest';

import {
    getHomesteadPlayfieldPlacements,
    getHomesteadPlayfieldSceneSummary,
} from '../js/world/homesteadPlayfieldProps.js';

describe('homestead playfield props', () => {
    it('places the approved packyard set in homestead scenes', () => {
        for (const sceneId of ['field', 'newsheepdogland']) {
            const placements = getHomesteadPlayfieldPlacements(sceneId);
            expect(placements).toHaveLength(11);
            expect(placements.map((placement) => placement.key)).toEqual([
                'utility-shed',
                'hay-bales-a',
                'hay-bales-b',
                'trough-bucket',
                'crate-stack',
                'barrel-rope',
                'log-pile-stump',
                'signpost',
                'stone-marker',
                'wildflower-a',
                'wildflower-b',
            ]);
            expect(placements.every((placement) => placement.path.startsWith('assets/models/homestead/'))).toBe(true);
            expect(placements.every((placement) => placement.paletteId === 'sds-pastoral-survival-v1')).toBe(true);
        }
    });

    it('limits non-homestead fields to sparse natural accents', () => {
        for (const sceneId of ['rolling-hills', 'open-country']) {
            const summary = getHomesteadPlayfieldSceneSummary(sceneId);
            expect(summary.count).toBe(4);
            expect(summary.kinds).toEqual(['natural-accent']);
            expect(summary.assets).toEqual([
                'stone-marker',
                'wildflower-a',
                'wildflower-b',
                'log-pile-stump',
            ]);
        }
    });

    it('does not add props to unplanned scenes', () => {
        expect(getHomesteadPlayfieldPlacements('forest').length).toBe(0);
        expect(getHomesteadPlayfieldSceneSummary('forest')).toMatchObject({
            sceneId: 'forest',
            count: 0,
            assets: [],
        });
    });
});
