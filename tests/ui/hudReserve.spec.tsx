// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 87 Phase 6: HudLayout publishes its layout reserves as CSS variables
 * on the document element so overlays living outside its React root (the
 * tutorial pill, the vanilla DayNightChip, the shared toast rail) derive
 * their clearance from the real HUD footprint instead of magic offsets.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

const responsive = vi.hoisted(() => ({
    isMobile: false,
    isLandscapeMobile: false,
    isPortrait: false,
}));

vi.mock('../../js/components/hooks/usePlatform.js', () => ({
    useResponsive: () => ({ ...responsive }),
    usePlatform: () => (responsive.isMobile ? 'mobile' : 'desktop'),
}));

import { HudLayout } from '../../js/components/GameHUD/HudLayout';
import { TutorialOverlay } from '../../js/components/Tutorial/TutorialOverlay';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

const rootVar = (name: string) => document.documentElement.style.getPropertyValue(name);

afterEach(() => {
    cleanup();
    responsive.isMobile = false;
    responsive.isLandscapeMobile = false;
    responsive.isPortrait = false;
});

describe('HudLayout reserve variables', () => {
    it('publishes the desktop reserves on mount and clears them on unmount', () => {
        const { unmount } = render(<HudLayout topLeft={<div>x</div>} />);
        expect(rootVar('--sds-bottom-reserve')).toBe('calc(env(safe-area-inset-bottom, 0px) + 16px)');
        expect(rootVar('--sds-toast-top-offset')).toBe('64px');
        expect(rootVar('--sds-topleft-reserve')).toBe('140px');
        unmount();
        expect(rootVar('--sds-bottom-reserve')).toBe('');
        expect(rootVar('--sds-toast-top-offset')).toBe('');
    });

    it('publishes the portrait-mobile reserve (the 140px controls clearance)', () => {
        responsive.isMobile = true;
        responsive.isPortrait = true;
        render(<HudLayout topLeft={<div>x</div>} />);
        expect(rootVar('--sds-bottom-reserve')).toBe('calc(env(safe-area-inset-bottom, 0px) + 140px)');
        expect(rootVar('--sds-toast-top-offset')).toBe('112px');
    });

    it('publishes the landscape-mobile reserve', () => {
        responsive.isMobile = true;
        responsive.isLandscapeMobile = true;
        render(<HudLayout topLeft={<div>x</div>} />);
        expect(rootVar('--sds-bottom-reserve')).toBe('calc(env(safe-area-inset-bottom, 0px) + 96px)');
    });
});

describe('TutorialOverlay derives its offset from the reserve', () => {
    it('the pill wrap bottom reads var(--sds-bottom-reserve)', () => {
        // Stable snapshot object: useSyncExternalStore loops if getSnapshot
        // returns a fresh object every call.
        const snap = { status: 'active' as const, step: 'move', penned: 0, goal: 3, completed: false };
        const machine = {
            subscribe: () => () => {},
            getSnapshot: () => snap,
            skip: () => {},
        };
        const { getByTestId } = render(<TutorialOverlay machine={machine} />);
        const wrap = getByTestId('tutorial-overlay');
        expect(wrap.style.bottom).toContain('var(--sds-bottom-reserve');
    });
});
