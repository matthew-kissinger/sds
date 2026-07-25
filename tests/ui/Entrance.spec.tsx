// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 113 Phase 3: what the One Door entrance is, and more to the point what
 * it is not.
 *
 * Every D6 removal in here is the kind that comes back. Someone adds a
 * "Sandbox" shortcut because it is one line and it is right there, and the door
 * is asking two questions again. These assertions are the record of a decision,
 * not a description of the markup.
 *
 * The selector contracts at the bottom are load-bearing in a different way: six
 * Playwright specs drive this surface, and a rename there fails in CI minutes
 * after it is too late to be cheap.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { Entrance, summarize } from '../../js/components/entrance/Entrance';

afterEach(cleanup);

const SOURCE = readFileSync(resolve(process.cwd(), 'js/components/entrance/Entrance.tsx'), 'utf8');

const LADDER = [
    { id: 'practice', name: 'Just Play', sheep: 30, blurb: '', ranked: false },
    { id: 'classic', name: 'Classic', sheep: 200, blurb: '', ranked: true },
    { id: 'extreme', name: 'Extreme', sheep: 1000, blurb: '', ranked: true },
    { id: 'insane', name: 'Insane', sheep: 3000, blurb: '', ranked: true },
    { id: 'chaos', name: 'Chaos', sheep: 5000, blurb: '', ranked: true },
];
const SOLO = { id: 'solo', name: 'Solo', gameMode: 'solo', rungs: LADDER };
const COUNTING = {
    id: 'counting', name: 'Counting Sheep', gameMode: 'counting',
    rungs: [{ id: 'incremental', name: 'Incremental', sheep: 5000, blurb: '+1 each round', ranked: true }],
};

const WORLDS = [
    { id: 'field', name: 'Home Field', tagline: 'A flat fenced pasture. The starter.', render: '/a.webp', accent: '', gradient: '' },
    { id: 'rolling-hills', name: 'Rolling Hills', tagline: 'A 180-metre island at golden hour.', render: '/b.webp', accent: '', gradient: '' },
    { id: 'newsheepdogland', name: 'Newsheepdogland', tagline: 'Back in the workshop.', render: '/c.webp', accent: '', gradient: '', comingSoon: true },
];

const DOGS = [
    { id: 'jep', name: 'Jep', portrait: '/jep.webp', trait: 'Balanced' },
    { id: 'pip', name: 'Pip', portrait: '/pip.webp', trait: 'Quick' },
];

function makeFlow(over = {}) {
    const family = over.family ?? SOLO;
    return {
        worlds: WORLDS, dogs: DOGS, ways: [],
        world: WORLDS[0], dog: DOGS[0], mode: family.rungs[1] ?? family.rungs[0],
        modes: family.rungs, worldIndex: 0,
        families: [SOLO, COUNTING], family,
        setFamily: vi.fn(), setMode: vi.fn(), setDog: vi.fn(),
        armWorld: vi.fn(), nextWorld: vi.fn(), prevWorld: vi.fn(), commit: vi.fn(),
        loading: { pct: 0, label: '', done: false },
        reducedMotion: true,
        ...over,
    };
}

const nav = () => ({
    onLeaderboard: vi.fn(), onAchievements: vi.fn(), onSettings: vi.fn(),
    onSandbox: vi.fn(), onLocal: vi.fn(), onMultiplayer: vi.fn(),
});

describe('summarize - the one sentence the door states', () => {
    it('reads a solo run as rung, count and dog', () => {
        expect(summarize(makeFlow())).toBe('Classic, 200 sheep, with Jep');
    });

    it('names the family for a counting run, where a sheep count would mislead', () => {
        // A counting run starts at one sheep and grows; printing the 5,000
        // ceiling would state something that is never true at the start.
        expect(summarize(makeFlow({ family: COUNTING }))).toBe('Counting Sheep, Incremental, with Jep');
    });

    it('separates with commas, so /Classic\\s+\\d/ still means a rung and not the summary', () => {
        expect(summarize(makeFlow())).not.toMatch(/Classic\s+\d/);
    });
});

describe('Entrance - one primary action (D3)', () => {
    it('renders exactly one button named Play', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(1);
    });

    it('carries the primary accent on that button and nothing else', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(document.querySelectorAll('.sds-ent-play')).toHaveLength(1);
    });

    it('commits the armed selection on Play', () => {
        const flow = makeFlow();
        render(<Entrance flow={flow} nav={nav()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Play' }));
        expect(flow.commit).toHaveBeenCalled();
    });

    it('refuses to commit a coming-soon world (D19)', () => {
        const flow = makeFlow({ world: WORLDS[2] });
        render(<Entrance flow={flow} nav={nav()} />);
        const play = screen.getByRole('button', { name: 'Coming soon' });
        expect(play.hasAttribute('disabled')).toBe(true);
        fireEvent.click(play);
        expect(flow.commit).not.toHaveBeenCalled();
    });
});

describe('Entrance - what left the primary surface (D6)', () => {
    it('shows no name field', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(screen.queryByText(/Playing as/)).toBeNull();
        expect(document.querySelector('input')).toBeNull();
    });

    it('shows no licence text until the menu is opened', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(document.body.textContent).not.toMatch(/AGPL/);
        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        expect(document.body.textContent).toMatch(/AGPL-3\.0/);
    });

    it('shows no sandbox or 2-player button on the surface, only inside the menu', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(screen.queryByRole('button', { name: 'Sandbox' })).toBeNull();
        expect(screen.queryByRole('button', { name: '2-player' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        expect(screen.getByRole('button', { name: 'Sandbox' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '2-player' })).toBeTruthy();
    });

    it('routes leaderboard and achievements from the menu, not from corner icons', () => {
        const n = nav();
        render(<Entrance flow={makeFlow()} nav={n} />);
        expect(screen.queryByRole('button', { name: 'Leaderboard' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'More' }));
        fireEvent.click(screen.getByRole('button', { name: 'Leaderboard' }));
        expect(n.onLeaderboard).toHaveBeenCalled();
    });

    it('leaves exactly two controls in the corner', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(document.querySelectorAll('.sds-ent-corner .sds-ent-iconbtn')).toHaveLength(2);
    });

    it('keeps multiplayer as a text-weight line, D6 one exception', () => {
        const n = nav();
        render(<Entrance flow={makeFlow()} nav={n} />);
        const mp = screen.getByRole('button', { name: /Play online/ });
        expect(mp.className).toBe('sds-ent-mp');
        fireEvent.click(mp);
        expect(n.onMultiplayer).toHaveBeenCalled();
    });

    it('mounts no tutorial offer (D4 moves it inside the first round)', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(screen.queryByTestId('tutorial-offer')).toBeNull();
        expect(SOURCE).not.toMatch(/TutorialOffer/);
    });
});

describe('Entrance - the summary line opens the picker in place', () => {
    it('starts collapsed', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(document.querySelector('[data-sds-picker]')).toBeNull();
        expect(document.querySelector('.sds-ent-summary')!.getAttribute('aria-expanded')).toBe('false');
    });

    it('opens inside the entrance rather than navigating away', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        fireEvent.click(document.querySelector('.sds-ent-summary')!);
        const picker = document.querySelector('[data-sds-picker]');
        expect(picker).not.toBeNull();
        expect(document.querySelector('.sds-ent-panel')!.contains(picker!)).toBe(true);
        // ...and Play is still on screen, so the one door never closed.
        expect(screen.getAllByRole('button', { name: 'Play' })).toHaveLength(1);
    });

    it('closes again on a second press', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        const summary = document.querySelector('.sds-ent-summary')!;
        fireEvent.click(summary);
        fireEvent.click(summary);
        expect(document.querySelector('[data-sds-picker]')).toBeNull();
    });
});

describe('Entrance - world switching lives on the image edges (D3)', () => {
    it('keeps the accessible names the e2e specs match', () => {
        const flow = makeFlow();
        render(<Entrance flow={flow} nav={nav()} />);
        fireEvent.click(screen.getByRole('button', { name: 'Next world' }));
        expect(flow.nextWorld).toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Previous world' }));
        expect(flow.prevWorld).toHaveBeenCalled();
    });

    it('leaves the armed world name as plain text in the overlay', () => {
        render(<Entrance flow={makeFlow()} nav={nav()} />);
        expect(screen.getByText('Home Field')).toBeTruthy();
    });

    it('marks the armed world in the dot row', () => {
        render(<Entrance flow={makeFlow({ worldIndex: 1, world: WORLDS[1] })} nav={nav()} />);
        const dots = [...document.querySelectorAll('.sds-ent-dot')];
        expect(dots).toHaveLength(WORLDS.length);
        expect(dots.findIndex((d) => d.classList.contains('sds-ent-dot-on'))).toBe(1);
    });
});

describe('Entrance - styled from the sheet, not inline', () => {
    it('holds no inline style object at all', () => {
        expect(SOURCE).not.toMatch(/style=\{\{/);
    });

    it('is short enough to read in one sitting', () => {
        // 449 lines before. The roadmap's line was "most of this cycle is
        // deletion"; this is the number that holds it. Counted as `wc -l`
        // counts (newline-terminated lines), because that is what the cycle
        // plan's acceptance line greps and the two must not disagree by one.
        const wcL = (SOURCE.match(/\n/g) ?? []).length;
        expect(wcL).toBeLessThan(260);
    });
});
