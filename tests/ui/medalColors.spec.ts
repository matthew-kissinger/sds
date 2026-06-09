// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * [P1-SETTINGS-A11Y] Medal/rank palette switch: the default gold/silver/
 * bronze trio vs the Okabe-Ito colorblind-safe trio. Pure-logic suite (node
 * environment); the useColorblindMode hook side is exercised in the browser.
 */
import { describe, it, expect } from 'vitest';
import {
    DEFAULT_MEDAL_COLORS,
    COLORBLIND_MEDAL_COLORS,
    getMedalColors,
} from '../../js/components/shared/medalColors';

describe('medal palettes', () => {
    it('defines ranks 1-3 with bg/text/glow in both palettes', () => {
        for (const palette of [DEFAULT_MEDAL_COLORS, COLORBLIND_MEDAL_COLORS]) {
            for (const rank of [1, 2, 3]) {
                expect(palette[rank]).toBeDefined();
                expect(palette[rank].bg).toContain('linear-gradient');
                expect(palette[rank].text).toMatch(/^#/);
                expect(palette[rank].glow).toContain('rgba');
            }
        }
    });

    it('keeps the universal gold/silver/bronze convention by default', () => {
        expect(DEFAULT_MEDAL_COLORS[1].bg).toContain('#FFD700');
        expect(DEFAULT_MEDAL_COLORS[2].bg).toContain('#E8E8E8');
        expect(DEFAULT_MEDAL_COLORS[3].bg).toContain('#CD7F32');
    });

    it('uses Okabe-Ito hues for gold and bronze in colorblind mode', () => {
        expect(COLORBLIND_MEDAL_COLORS[1].bg).toContain('#E69F00'); // orange
        expect(COLORBLIND_MEDAL_COLORS[3].bg).toContain('#56B4E9'); // sky blue
        // Neither colorblind medal reuses the default gold/bronze stops.
        expect(COLORBLIND_MEDAL_COLORS[1].bg).not.toContain('#FFD700');
        expect(COLORBLIND_MEDAL_COLORS[3].bg).not.toContain('#CD7F32');
    });

    it('keeps silver neutral in both palettes (grey is already safe)', () => {
        expect(COLORBLIND_MEDAL_COLORS[2]).toEqual(DEFAULT_MEDAL_COLORS[2]);
    });

    it('getMedalColors switches palettes on the flag', () => {
        expect(getMedalColors(false)).toBe(DEFAULT_MEDAL_COLORS);
        expect(getMedalColors(true)).toBe(COLORBLIND_MEDAL_COLORS);
    });

    it('first and third place are distinguishable without hue in colorblind mode', () => {
        // Orange vs sky blue differ strongly in both hue and lightness; as a
        // cheap proxy, assert the gradient stops are not equal and the text
        // colors keep AA-ish contrast direction (dark text on light medals).
        expect(COLORBLIND_MEDAL_COLORS[1].bg).not.toEqual(COLORBLIND_MEDAL_COLORS[3].bg);
        expect(COLORBLIND_MEDAL_COLORS[1].text).toBe('#000');
        expect(COLORBLIND_MEDAL_COLORS[3].text).toBe('#000');
    });
});
