// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * [P1-SHARE] share-text builder for the completion screen.
 *
 * buildShareText is pure (mode + run data + translate in, share payload out),
 * so this runs in the node environment. The translate helper resolves keys
 * against the real en locale, which also proves every key the builder asks
 * for exists, and lets the prose-rule checks (no em-dashes, no exclamation
 * marks) run against the strings that actually ship.
 */
import { describe, it, expect } from 'vitest';
import { buildShareText, SHARE_URL } from '../../js/components/GameHUD/shareText';
import en from '../../js/locales/en/index.js';

function t(key: string, options: Record<string, unknown> = {}): string {
    const value = key.split('.').reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part],
        en,
    );
    if (typeof value !== 'string') throw new Error(`missing en locale key: ${key}`);
    return value.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(options[name]));
}

describe('buildShareText [P1-SHARE]', () => {
    it('single: concrete sheep count and mm:ss time', () => {
        const p = buildShareText('single', { totalSheep: 200, finalTime: 222 }, t);
        expect(p.text).toBe('Herded 200 sheep into the pen in 3:42 on Sheep Dog Sim.');
        expect(p.title).toBe('Sheep Dog Sim');
        expect(p.url).toBe(SHARE_URL);
        expect(p.clipboardText).toBe(`${p.text} ${SHARE_URL}`);
    });

    it('single: pads seconds (1:01, not 1:1)', () => {
        const p = buildShareText('single', { totalSheep: 30, finalTime: 61 }, t);
        expect(p.text).toContain('1:01');
    });

    it('counting: banked total and round reached', () => {
        const p = buildShareText('counting', { counted: 340, round: 7 }, t);
        expect(p.text).toBe('Counted 340 sheep and reached round 7 on Sheep Dog Sim.');
    });

    it('racing: winner and non-winner variants use myScore', () => {
        const win = buildShareText('racing', { myScore: 64, isWinner: true }, t);
        const loss = buildShareText('racing', { myScore: 41, isWinner: false }, t);
        expect(win.text).toBe('Won a multiplayer round with 64 sheep on Sheep Dog Sim.');
        expect(loss.text).toBe('Penned 41 sheep in a multiplayer round on Sheep Dog Sim.');
    });

    it('timed: maps to the same multiplayer variants', () => {
        const win = buildShareText('timed', { myScore: 52, isWinner: true }, t);
        expect(win.text).toBe('Won a multiplayer round with 52 sheep on Sheep Dog Sim.');
        const loss = buildShareText('timed', { myScore: 12 }, t);
        expect(loss.text).toBe('Penned 12 sheep in a multiplayer round on Sheep Dog Sim.');
    });

    it('cooperative: team herd total', () => {
        const p = buildShareText('cooperative', { totalSheep: 200, sheepCount: 200 }, t);
        expect(p.text).toBe('Herded 200 sheep with the team on Sheep Dog Sim.');
    });

    it('unknown mode: generic line, never throws', () => {
        const p = buildShareText('survival-something-new', {}, t);
        expect(p.text).toBe('Finished a round of Sheep Dog Sim.');
    });

    it('prose rule: no em-dashes, exclamation marks, or emoji in any variant', () => {
        const variants = [
            buildShareText('single', { totalSheep: 200, finalTime: 100 }, t),
            buildShareText('counting', { counted: 10, round: 2 }, t),
            buildShareText('racing', { myScore: 5, isWinner: true }, t),
            buildShareText('racing', { myScore: 5, isWinner: false }, t),
            buildShareText('cooperative', { totalSheep: 200 }, t),
            buildShareText('other', {}, t),
        ];
        for (const v of variants) {
            expect(v.text).not.toMatch(/[—!]/);
            expect(v.text).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
            expect(v.title).not.toMatch(/[—!]/);
        }
    });
});
