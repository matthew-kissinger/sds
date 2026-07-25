// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 113 Phase 2: the D3 / D7 rules the picker exists to hold.
 *
 * The interesting cases are all about what is NOT on screen. A picker that
 * renders every rung, or renders a family selector for a world with one
 * family, is exactly the entrance the front-end review found: correct, and
 * asking more questions than it needs to.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, within, fireEvent } from '@testing-library/react';

import { EntrancePicker, visibleRungs, VISIBLE_RUNGS } from '../../js/components/entrance/EntrancePicker';

afterEach(cleanup);

const LADDER = [
    { id: 'practice', name: 'Just Play', sheep: 30, blurb: '', ranked: false },
    { id: 'classic', name: 'Classic', sheep: 200, blurb: '', ranked: true },
    { id: 'extreme', name: 'Extreme', sheep: 1000, blurb: '', ranked: true },
    { id: 'insane', name: 'Insane', sheep: 3000, blurb: '', ranked: true },
    { id: 'chaos', name: 'Chaos', sheep: 5000, blurb: '', ranked: true },
];

const CURVES = [
    { id: 'incremental', name: 'Incremental', sheep: 5000, blurb: '+1 each round', ranked: true },
    { id: 'exponential', name: 'Exponential', sheep: 5000, blurb: 'doubles each round', ranked: true },
];

const DOGS = [
    { id: 'jep', name: 'Jep', portrait: '/assets/dogs/jep.webp', trait: 'Balanced' },
    { id: 'pip', name: 'Pip', portrait: '/assets/dogs/pip.webp', trait: 'Quick' },
    { id: 'george_washington', name: 'George Washington', portrait: '/assets/dogs/gw.webp', trait: 'Stately' },
];

const SOLO = { id: 'solo', name: 'Solo', gameMode: 'solo', rungs: LADDER };
const COUNTING = { id: 'counting', name: 'Counting Sheep', gameMode: 'counting', rungs: CURVES };

function makeFlow(over = {}) {
    const family = over.family ?? SOLO;
    const modes = over.modes ?? family.rungs;
    return {
        worlds: [], ways: [], world: { id: 'field', name: 'Home Field' },
        dogs: DOGS,
        dog: DOGS[0],
        modes,
        mode: modes[1],
        worldIndex: 0,
        families: [SOLO, COUNTING],
        family,
        setFamily: vi.fn(),
        setMode: vi.fn(),
        setDog: vi.fn(),
        armWorld: vi.fn(), nextWorld: vi.fn(), prevWorld: vi.fn(), commit: vi.fn(),
        loading: { pct: 0, label: '', done: false },
        reducedMotion: true,
        ...over,
    };
}

const rungNames = () =>
    within(document.querySelector('.sds-ent-rungs')!)
        .queryAllByRole('button')
        .map((b) => b.querySelector('.sds-ent-rung-name')?.textContent ?? b.textContent?.trim());

describe('visibleRungs - the D7 rule in isolation', () => {
    it('shows the whole ladder when it is short enough', () => {
        expect(visibleRungs(CURVES, 'incremental', false)).toHaveLength(2);
        expect(visibleRungs(LADDER.slice(0, 3), 'classic', false)).toHaveLength(3);
    });

    it('shows the first three when the armed rung is among them', () => {
        expect(visibleRungs(LADDER, 'classic', false).map((r) => r.id))
            .toEqual(['practice', 'classic', 'extreme']);
    });

    it('appends the armed rung when it sits outside the first three', () => {
        expect(visibleRungs(LADDER, 'chaos', false).map((r) => r.id))
            .toEqual(['practice', 'classic', 'extreme', 'chaos']);
    });

    it('shows everything once expanded', () => {
        expect(visibleRungs(LADDER, 'classic', true)).toHaveLength(LADDER.length);
    });

    it('does not invent a rung when the armed id is unknown', () => {
        expect(visibleRungs(LADDER, 'no-such-rung', false)).toHaveLength(VISIBLE_RUNGS);
    });

    it('never mutates the ladder it was handed', () => {
        const frozen = Object.freeze([...LADDER]);
        expect(() => visibleRungs(frozen, 'chaos', false)).not.toThrow();
        expect(frozen).toHaveLength(5);
    });
});

describe('EntrancePicker - the family row (Q1)', () => {
    it('renders a selector when the world offers more than one family', () => {
        render(<EntrancePicker flow={makeFlow()} onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Solo' })).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Counting Sheep' })).toBeTruthy();
    });

    it('renders nothing at all when the world offers one family', () => {
        const objective = { id: 'objective', name: 'Objective', gameMode: 'solo', rungs: LADDER };
        render(<EntrancePicker flow={makeFlow({ families: [objective], family: objective })} onClose={vi.fn()} />);
        expect(screen.queryByRole('button', { name: 'Objective' })).toBeNull();
        // ...and no orphaned label where the row used to be.
        expect(screen.queryByText('Mode')).toBeNull();
    });

    it('marks the armed family pressed and routes a change through the flow', () => {
        const flow = makeFlow();
        render(<EntrancePicker flow={flow} onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: 'Solo' }).getAttribute('aria-pressed')).toBe('true');
        fireEvent.click(screen.getByRole('button', { name: 'Counting Sheep' }));
        expect(flow.setFamily).toHaveBeenCalledWith('counting');
    });
});

describe('EntrancePicker - three rungs plus More (Q2, D7)', () => {
    it('renders exactly three rungs plus More for a five-rung ladder', () => {
        render(<EntrancePicker flow={makeFlow()} onClose={vi.fn()} />);
        expect(rungNames()).toEqual(['Just Play', 'Classic', 'Extreme', 'More']);
    });

    it('renders the armed rung without More being pressed when it sits outside the head', () => {
        render(<EntrancePicker flow={makeFlow({ mode: LADDER[4] })} onClose={vi.fn()} />);
        expect(rungNames()).toEqual(['Just Play', 'Classic', 'Extreme', 'Chaos', 'More']);
    });

    it('reveals the rest in place when More is pressed, and keeps them revealed', () => {
        render(<EntrancePicker flow={makeFlow()} onClose={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /Show 2 more/ }));
        expect(rungNames()).toEqual(['Just Play', 'Classic', 'Extreme', 'Insane', 'Chaos']);
        expect(screen.queryByRole('button', { name: /Show \d+ more/ })).toBeNull();
    });

    it('offers no More when the ladder fits', () => {
        render(<EntrancePicker flow={makeFlow({ family: COUNTING })} onClose={vi.fn()} />);
        expect(rungNames()).toEqual(['Incremental', 'Exponential']);
    });

    it('shows the sheep count on a solo rung and the curve hint on a counting rung', () => {
        const { unmount } = render(<EntrancePicker flow={makeFlow()} onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Classic\s+200/ })).toBeTruthy();
        unmount();
        render(<EntrancePicker flow={makeFlow({ family: COUNTING })} onClose={vi.fn()} />);
        expect(screen.getByRole('button', { name: /Exponential\s+doubles each round/ })).toBeTruthy();
    });

    it('routes a rung change through the flow and does NOT close', () => {
        const flow = makeFlow();
        const onClose = vi.fn();
        render(<EntrancePicker flow={flow} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /Extreme/ }));
        expect(flow.setMode).toHaveBeenCalledWith('extreme');
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('EntrancePicker - the dog row', () => {
    it('renders every dog inline rather than behind a toggle', () => {
        render(<EntrancePicker flow={makeFlow()} onClose={vi.fn()} />);
        const dogs = document.querySelectorAll('.sds-ent-dog');
        expect(dogs).toHaveLength(DOGS.length);
    });

    it('picking a dog sets it and then closes the picker', () => {
        const flow = makeFlow();
        const onClose = vi.fn();
        render(<EntrancePicker flow={flow} onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: /Pip/ }));
        expect(flow.setDog).toHaveBeenCalledWith('pip');
        expect(onClose).toHaveBeenCalled();
    });

    it('shows only the first name, so George Washington does not blow out the row', () => {
        render(<EntrancePicker flow={makeFlow()} onClose={vi.fn()} />);
        const labels = [...document.querySelectorAll('.sds-ent-dog')].map((b) => b.lastElementChild?.textContent);
        expect(labels).toEqual(['Jep', 'Pip', 'George']);
    });
});

describe('EntrancePicker - it styles itself from the sheet, not inline', () => {
    it('renders no inline style attribute of its own', () => {
        render(<EntrancePicker flow={makeFlow()} onClose={vi.fn()} />);
        const root = document.querySelector('[data-sds-picker]')!;
        // DogAvatar and Icon are shared primitives with their own inline
        // styles; the picker's own elements carry className only.
        const own = [...root.querySelectorAll('[style]')]
            .filter((el) => !el.closest('[role="img"]') && el.tagName !== 'svg');
        expect(own.map((el) => el.className)).toEqual([]);
    });
});
