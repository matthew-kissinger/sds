// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 87 Phase 6: HudLayout publishes its layout reserves as CSS variables
 * on the document element so overlays living outside its React root (the
 * tutorial pill, the vanilla DayNightChip, the shared toast rail) derive
 * their clearance from the real HUD footprint instead of magic offsets.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
        unmount();
        expect(rootVar('--sds-bottom-reserve')).toBe('');
        expect(rootVar('--sds-toast-top-offset')).toBe('');
        expect(rootVar('--sds-topleft-reserve')).toBe('');
    });

    it('measures the topLeft slot rather than publishing a fixed 140px', () => {
        // Cycle 112 Phase 3: this used to assert a hardcoded '140px', which was
        // the defect. The reserve under-reported the real stack whenever the
        // SheepCounter carried its stamina bar, and the DayNightChip that pins
        // below it drew over the panel's lower text.
        //
        // jsdom has no layout, so every rect is 0 and the published value is
        // '0px'. That is the correct behaviour for an unmeasurable slot (do not
        // reserve space that is not there) and it pins the important half: the
        // number is derived from a measurement, never from a constant. The
        // measured-growth behaviour is verified against a real engine instead,
        // where the reserve tracked a panel from 139px to 229px and back.
        render(<HudLayout topLeft={<div>x</div>} />);
        const reserve = rootVar('--sds-topleft-reserve');
        expect(reserve).toMatch(/^\d+px$/);
        expect(reserve).not.toBe('140px');
    });

    it('publishes a zero topLeft reserve when the slot is empty', () => {
        render(<HudLayout topCenter={<div>x</div>} />);
        expect(rootVar('--sds-topleft-reserve')).toBe('0px');
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

    it('publishes a top reserve, and clears it on unmount', () => {
        // Cycle 112 Phase 3: the edge slot self-positions across the full
        // viewport width, so it cannot know which corner it will land in. This
        // is the union of all three top stacks. Same jsdom caveat as the
        // topLeft measurement above: no layout means 0px, and the assertion
        // that matters is that the variable exists and clears.
        const { unmount } = render(<HudLayout topCenter={<div>x</div>} />);
        expect(rootVar('--sds-hud-top-reserve')).toMatch(/^(0px|calc\(.+\))$/);
        unmount();
        expect(rootVar('--sds-hud-top-reserve')).toBe('');
    });
});

describe('CorralCompass stays inside the reserved band', () => {
    it('positions against the band between the top stack and the controls', () => {
        // Cycle 112 Phase 3: the compass used to position against the raw
        // viewport, so its +/-0.85 NDC envelope put the distance pill through
        // the "Follow" camera chip at 390x844 (measured: a 26x12px overlap).
        // Reading both reserves is what keeps it off the HUD without a second
        // set of magic offsets, so the source is pinned rather than the pixels.
        // Resolved from cwd (the repo root under vitest), not import.meta.url:
        // this file runs in jsdom, where Vite hands out an http:// module URL
        // that readFileSync cannot take.
        const src = readFileSync(
            resolve(process.cwd(), 'js/components/GameHUD/CorralCompass.tsx'),
            'utf8',
        );
        expect(src).toContain('var(--sds-hud-top-reserve');
        expect(src).toContain('var(--sds-bottom-reserve');
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
