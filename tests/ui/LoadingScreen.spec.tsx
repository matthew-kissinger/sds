// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * What the loading surface may and may not carry.
 *
 * Three acceptance lines land here, and each is the kind that silently
 * regresses because nothing renders wrong, it just comes back:
 *
 *   112 P5 - the hero backdrop is sharp. It shipped under `filter: blur(2px)`
 *   plus a 1.05 upscale, which spent the one image doing the work of making the
 *   wait read as an approach rather than a gate. The panel's own
 *   `backdrop-filter` is a different thing and stays: that is the glass card
 *   frosting what is behind it, not the hero being thrown away.
 *
 *   112 P3 (D6) - no license text. It moved to the entrance corner menu.
 *
 *   113 P5 - this is the entrance holding still, not a second screen. It reads
 *   the same stylesheet, wears the same glass, and docks where the entrance
 *   panel sat. The frosting assertion moved from the inline style attribute to
 *   the sheet with it: jsdom applies no stylesheet, so the honest test is that
 *   the panel wears the glass class AND that css/entrance.css frosts it.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SHEET = readFileSync(resolve(process.cwd(), 'css/entrance.css'), 'utf8');
const SOURCE = readFileSync(resolve(process.cwd(), 'js/components/entrance/LoadingScreen.tsx'), 'utf8');

/**
 * The declaration block for one class in the sheet. Index-based rather than a
 * built regex: a class name interpolated into a template literal loses its own
 * backslashes to the template's escape handling, which produces a pattern that
 * matches nothing and a test that passes for the wrong reason.
 */
const ruleFor = (cls: string): string => {
    const at = SHEET.indexOf(`.${cls} {`);
    return at < 0 ? '' : SHEET.slice(at, SHEET.indexOf('}', at));
};

import { LoadingScreen } from '../../js/components/entrance/LoadingScreen';

afterEach(cleanup);

const flow = {
    world: {
        id: 'field',
        name: 'Home Field',
        render: '/images/scenes/field.avif',
        gradient: 'linear-gradient(#cfe0f0, #a8c8a0)',
    },
    dog: { id: 'jep', name: 'Jep' },
    mode: { id: 'just-play', name: 'Just Play' },
    loading: { pct: 42, label: 'Building terrain' },
    // The real BootFlow carries the pickers, the tutorial machine and the
    // renderer handoff. None of it reaches this surface, so the stub stays at
    // what LoadingScreen actually reads.
} as any;

const renderLoading = () => render(<LoadingScreen flow={flow} />).container;

describe('LoadingScreen', () => {
    it('holds the hero sharp - no blur filter anywhere in the tree', () => {
        const container = renderLoading();
        const blurred = [...container.querySelectorAll<HTMLElement>('*')]
            .filter((el) => /blur/.test(el.style.filter || ''));
        expect(blurred).toEqual([]);
    });

    it('does not upscale the backdrop to hide the blur edges', () => {
        const container = renderLoading();
        const scaled = [...container.querySelectorAll<HTMLElement>('*')]
            .filter((el) => /scale\(/.test(el.style.transform || ''));
        expect(scaled).toEqual([]);
    });

    it('keeps the glass panel frosted - backdrop-filter is not the same knob', () => {
        const container = renderLoading();
        expect(container.querySelector('.sds-ent-loading-panel')).not.toBeNull();
        expect(ruleFor('sds-ent-loading-panel')).toMatch(/backdrop-filter:\s*blur/);
    });

    it('declares no filter: blur on the hero in the sheet either', () => {
        for (const cls of ['sds-ent-hero', 'sds-ent-loading', 'sds-ent-loading-scrim']) {
            expect(ruleFor(cls), cls).not.toMatch(/(^|[^-])filter:\s*blur/);
        }
    });

    it('carries no license or copyright text (D6 moved it to the info menu)', () => {
        renderLoading();
        expect(screen.queryByText(/AGPL/i)).toBeNull();
        expect(screen.queryByText(/copyright|©/i)).toBeNull();
    });

    it('still names the armed world, dog and mode', () => {
        renderLoading();
        expect(screen.getByText('Home Field')).toBeTruthy();
        expect(screen.getByText(/Jep/)).toBeTruthy();
        expect(screen.getByText(/Just Play/)).toBeTruthy();
    });
});

describe('LoadingScreen is the entrance holding still (Cycle 113 P5)', () => {
    it('carries no inline style object of its own', () => {
        expect(SOURCE).not.toMatch(/style=\{\{/);
    });

    it('docks where the entrance panel sat instead of centring', () => {
        const container = renderLoading();
        // Same dock element as the entrance, so the panel does not jump across
        // the frame at the moment the player presses Play.
        const dock = container.querySelector('.sds-ent-dock');
        expect(dock).not.toBeNull();
        expect(dock!.querySelector('.sds-ent-loading-panel')).not.toBeNull();
    });

    it('keeps the world name in the masthead across the cut', () => {
        const container = renderLoading();
        const name = container.querySelector('.sds-ent-masthead .sds-ent-world-name');
        expect(name?.textContent).toBe('Home Field');
    });

    it('reports build progress to assistive tech, not just visually', () => {
        renderLoading();
        const bar = screen.getByRole('progressbar');
        expect(bar.getAttribute('aria-valuenow')).toBe('42');
    });
});
