// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 112 Phase 5 + Phase 3: what the loading surface may and may not carry.
 *
 * Two acceptance lines land here, and both are the kind that silently regress
 * because nothing renders them wrong, they just come back:
 *
 *   Phase 5 - the hero backdrop is sharp. It shipped under `filter: blur(2px)`
 *   plus a 1.05 upscale, which spent the one image doing the work of making the
 *   wait read as an approach rather than a gate. The panel's own
 *   `backdropFilter` is a different thing and stays: that is the glass card
 *   frosting what is behind it, not the hero being thrown away.
 *
 *   Phase 3 (D6) - no license text. It moved to the entrance info menu.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

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

    it('keeps the glass panel frosted - backdropFilter is not the same knob', () => {
        const container = renderLoading();
        const frosted = [...container.querySelectorAll<HTMLElement>('*')]
            .filter((el) => /blur/.test(el.style.backdropFilter || ''));
        expect(frosted.length).toBeGreaterThan(0);
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
