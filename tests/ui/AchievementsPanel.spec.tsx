// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * AchievementsPanel (menu list view) - [P3-ACHIEVE-UI].
 *
 * Renders the full definitions registry with locked/unlocked state from a
 * mocked engine: every definition's localized name + description appears,
 * unlocked rows carry the unlock date, locked rows carry the locked label,
 * the summary counts unlocks, and Back fires onBack.
 *
 * react-i18next has no instance in tests, so useTranslation is mocked to
 * echo keys (with the date interpolation made visible), matching the
 * lightweight modal spec pattern.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { createElement } from 'react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (k: string, opts?: Record<string, unknown>) => {
            if (opts && 'date' in opts) return `${k} ${opts.date}`;
            if (opts && 'unlocked' in opts) return `${k} ${opts.unlocked}/${opts.total}`;
            return k;
        },
        i18n: { language: 'en' },
    }),
}));

// Mock the achievements module: a small registry + a one-unlock map. The
// panel is a pure view over these two reads.
vi.mock('../../js/achievements/index.js', () => ({
    ACHIEVEMENTS: [
        {
            id: 'first-pen',
            event: 'solo-complete',
            nameKey: 'achievements.firstPen.name',
            descKey: 'achievements.firstPen.desc',
            check: () => true,
        },
        {
            id: 'survive-5-nights',
            event: 'survival-night-survived',
            nameKey: 'achievements.survive5Nights.name',
            descKey: 'achievements.survive5Nights.desc',
            check: () => true,
        },
        {
            id: 'win-competitive-room',
            event: 'competitive-win',
            nameKey: 'achievements.winCompetitiveRoom.name',
            descKey: 'achievements.winCompetitiveRoom.desc',
            check: () => true,
        },
    ],
    getUnlocked: vi.fn(() => ({ 'first-pen': '2026-06-01T12:00:00.000Z' })),
}));

import { AchievementsPanel } from '../../js/components/StartScreen/AchievementsPanel.js';

afterEach(() => {
    cleanup();
});

describe('AchievementsPanel', () => {
    it('renders every definition with localized name and description', () => {
        render(createElement(AchievementsPanel, { onBack: vi.fn() }));
        expect(screen.getByText('achievements.firstPen.name')).toBeTruthy();
        expect(screen.getByText('achievements.firstPen.desc')).toBeTruthy();
        expect(screen.getByText('achievements.survive5Nights.name')).toBeTruthy();
        expect(screen.getByText('achievements.survive5Nights.desc')).toBeTruthy();
        expect(screen.getByText('achievements.winCompetitiveRoom.name')).toBeTruthy();
        expect(screen.getByText('achievements.winCompetitiveRoom.desc')).toBeTruthy();
    });

    it('shows the unlock date on unlocked rows and the locked label on the rest', () => {
        render(createElement(AchievementsPanel, { onBack: vi.fn() }));
        // Unlocked row: the unlockedOn key interpolated with a formatted date
        // (mocked t appends the date passed in).
        const unlockedLine = screen.getByText(/^achievements\.ui\.unlockedOn /);
        expect(unlockedLine.textContent).toMatch(/2026/);
        // The two locked definitions both show the locked label.
        expect(screen.getAllByText('achievements.ui.locked')).toHaveLength(2);
    });

    it('summarizes unlock progress (1 of 3)', () => {
        render(createElement(AchievementsPanel, { onBack: vi.fn() }));
        expect(screen.getByText('achievements.ui.summary 1/3')).toBeTruthy();
    });

    it('titles the panel from the locale key', () => {
        render(createElement(AchievementsPanel, { onBack: vi.fn() }));
        expect(screen.getByText('achievements.ui.panelTitle')).toBeTruthy();
    });

    it('Back fires onBack', () => {
        const onBack = vi.fn();
        render(createElement(AchievementsPanel, { onBack }));
        fireEvent.click(screen.getByText('common.backToMenu'));
        expect(onBack).toHaveBeenCalledTimes(1);
    });
});
