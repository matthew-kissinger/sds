/** @vitest-environment jsdom */
/**
 * Cycle 48 P4: render smoke harness for the converted ui leftovers
 * (LanguageSelector, SceneSwapOverlay). Each mounts in jsdom and renders its
 * expected DOM without throwing. Token var() / color-mix() strings don't
 * resolve in jsdom, but they must not crash render.
 *
 * react-i18next has no instance in tests, so useTranslation is mocked to echo
 * keys and report 'en' as the active language (so LanguageSelector's
 * selected-row check mark renders). The i18n LANGUAGES table is mocked to a
 * single English row. GameBridge's subscribeGameEvent is mocked to capture the
 * SceneSwapOverlay handlers so the test can drive the swap state machine and
 * assert both the visible-overlay path and the Cycle 46 attract-crossfade skip.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent, act } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en', changeLanguage: vi.fn() } }),
}));

vi.mock('../../js/i18n.js', () => ({
    LANGUAGES: [{ code: 'en', nativeName: 'English', flag: 'EN' }],
}));

const { swapHandlers } = vi.hoisted(() => ({
    swapHandlers: {} as Record<string, () => void>,
}));

vi.mock('../../js/GameBridge.js', () => ({
    subscribeGameEvent: (name: string, cb: () => void) => {
        swapHandlers[name] = cb;
        return () => {
            delete swapHandlers[name];
        };
    },
}));

import { LanguageSelector } from '../../js/components/ui/LanguageSelector';
import { SceneSwapOverlay } from '../../js/components/ui/SceneSwapOverlay';

afterEach(() => {
    cleanup();
    delete (window as { __sdsAttractCrossfadeActive?: boolean }).__sdsAttractCrossfadeActive;
});

describe('LanguageSelector (smoke)', () => {
    it('renders the icon-variant globe button labelled for the active language', () => {
        render(<LanguageSelector variant="icon" />);
        expect(screen.getByRole('button', { name: 'Change language' })).toBeTruthy();
    });

    it('opens the dropdown and lists the active language with its selected mark', () => {
        render(<LanguageSelector variant="icon" />);
        fireEvent.click(screen.getByRole('button', { name: 'Change language' }));
        expect(screen.getByText('English')).toBeTruthy();
    });

    it('renders the full-variant button showing the current language', () => {
        render(<LanguageSelector variant="full" />);
        expect(screen.getByText('English')).toBeTruthy();
    });
});

describe('SceneSwapOverlay (smoke)', () => {
    it('renders nothing while idle', () => {
        const { container } = render(<SceneSwapOverlay />);
        expect(container.firstChild).toBeNull();
    });

    it('shows the loading chrome once a scene swap starts', () => {
        render(<SceneSwapOverlay />);
        act(() => {
            swapHandlers['scene-swap-start']?.();
        });
        expect(screen.getByText('Loading scene…')).toBeTruthy();
    });

    it('skips the DOM cover when the attract crossfade is active (Cycle 46 contract)', () => {
        (window as { __sdsAttractCrossfadeActive?: boolean }).__sdsAttractCrossfadeActive = true;
        const { container } = render(<SceneSwapOverlay />);
        act(() => {
            swapHandlers['scene-swap-start']?.();
        });
        expect(container.firstChild).toBeNull();
    });
});
