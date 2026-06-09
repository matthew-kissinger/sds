// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * P1-TUTORIAL: the entrance offer card's gating + actions.
 *
 * Mounts TutorialOffer against jsdom localStorage: a fresh profile sees the
 * offer; a returning player (sds:tutorialDone = '1') sees nothing; declining
 * persists the flag; accepting hands off to startTutorial with the armed dog.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { TUTORIAL_DONE_KEY } from '../../js/components/Tutorial/tutorialMachine.js';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

const startTutorial = vi.fn(async () => {});
vi.mock('../../js/components/Tutorial/startTutorial.js', () => ({
    startTutorial: (...args: unknown[]) => startTutorial(...args),
    isTutorialSessionActive: () => false,
}));

import { TutorialOffer } from '../../js/components/Tutorial/TutorialOffer';

afterEach(() => {
    cleanup();
    localStorage.clear();
    startTutorial.mockClear();
});

describe('TutorialOffer (P1-TUTORIAL)', () => {
    it('shows on a first launch (no sds:tutorialDone flag)', () => {
        render(<TutorialOffer dogId="jep" />);
        expect(screen.getByText('tutorial.offerTitle')).toBeTruthy();
        expect(screen.getByText('tutorial.offerStart')).toBeTruthy();
        expect(screen.getByText('tutorial.offerSkip')).toBeTruthy();
    });

    it('renders nothing once the flag is set (never auto-offers again)', () => {
        localStorage.setItem(TUTORIAL_DONE_KEY, '1');
        const { container } = render(<TutorialOffer dogId="jep" />);
        expect(container.firstChild).toBeNull();
    });

    it('declining persists the flag and hides the card', () => {
        render(<TutorialOffer dogId="jep" />);
        fireEvent.click(screen.getByText('tutorial.offerSkip'));
        expect(localStorage.getItem(TUTORIAL_DONE_KEY)).toBe('1');
        expect(screen.queryByText('tutorial.offerTitle')).toBeNull();
        expect(startTutorial).not.toHaveBeenCalled();
    });

    it('accepting starts the guided run with the armed dog and hides the card', () => {
        render(<TutorialOffer dogId="sally" />);
        fireEvent.click(screen.getByText('tutorial.offerStart'));
        expect(startTutorial).toHaveBeenCalledWith({ dogId: 'sally' });
        expect(screen.queryByText('tutorial.offerTitle')).toBeNull();
        // Accepting alone does not persist; completion or skip does.
        expect(localStorage.getItem(TUTORIAL_DONE_KEY)).toBeNull();
    });
});
