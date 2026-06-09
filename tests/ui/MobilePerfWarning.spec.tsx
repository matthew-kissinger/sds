// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * P1-MOBILE-WARN: the mobile big-flock performance warning.
 *
 * Pure gate (shouldWarnMobileSheep): a mobile client arming a >1000-sheep solo
 * mode (Insane 3,000 / Chaos 5,000) warns; desktop, <=1000, and counting runs
 * (which start at one sheep) do not.
 *
 * Dialog (MobilePerfWarning): renders both choices; "continue anyway" fires
 * onContinue (the entrance then commits the round - player choice wins) and
 * "go back" fires onBack without committing.
 *
 * react-i18next has no instance in tests, so useTranslation is mocked to echo
 * keys, matching the Multiplayer smoke-spec pattern.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

import { shouldWarnMobileSheep, MOBILE_SHEEP_WARN_THRESHOLD } from '../../js/utils/mobileSheepWarning.js';
import { MobilePerfWarning } from '../../js/components/entrance/MobilePerfWarning';

afterEach(() => {
    cleanup();
});

describe('shouldWarnMobileSheep (gate)', () => {
    it('warns on mobile for Insane (3000) and Chaos (5000)', () => {
        expect(shouldWarnMobileSheep({ sheepCount: 3000, isMobile: true, gameMode: 'solo' })).toBe(true);
        expect(shouldWarnMobileSheep({ sheepCount: 5000, isMobile: true, gameMode: 'solo' })).toBe(true);
    });

    it('does not warn on mobile at or below the 1000 threshold', () => {
        expect(MOBILE_SHEEP_WARN_THRESHOLD).toBe(1000);
        expect(shouldWarnMobileSheep({ sheepCount: 1000, isMobile: true, gameMode: 'solo' })).toBe(false);
        expect(shouldWarnMobileSheep({ sheepCount: 200, isMobile: true, gameMode: 'solo' })).toBe(false);
        expect(shouldWarnMobileSheep({ sheepCount: 30, isMobile: true, gameMode: 'solo' })).toBe(false);
    });

    it('never warns on desktop, at any count', () => {
        expect(shouldWarnMobileSheep({ sheepCount: 3000, isMobile: false, gameMode: 'solo' })).toBe(false);
        expect(shouldWarnMobileSheep({ sheepCount: 5000, isMobile: false, gameMode: 'solo' })).toBe(false);
    });

    it('does not warn for counting runs (they start at one sheep despite the 5000 ceiling)', () => {
        expect(shouldWarnMobileSheep({ sheepCount: 5000, isMobile: true, gameMode: 'counting' })).toBe(false);
    });

    it('defaults gameMode to solo', () => {
        expect(shouldWarnMobileSheep({ sheepCount: 3000, isMobile: true })).toBe(true);
    });
});

describe('MobilePerfWarning (dialog)', () => {
    it('renders the warning copy and both choices', () => {
        render(<MobilePerfWarning sheepCount={3000} onContinue={vi.fn()} onBack={vi.fn()} />);
        expect(screen.getByRole('dialog')).toBeTruthy();
        expect(screen.getByText('mobileWarning.title')).toBeTruthy();
        expect(screen.getByText('mobileWarning.body')).toBeTruthy();
        expect(screen.getByText('mobileWarning.continue')).toBeTruthy();
        expect(screen.getByText('mobileWarning.goBack')).toBeTruthy();
    });

    it('continue proceeds: fires onContinue, not onBack', () => {
        const onContinue = vi.fn();
        const onBack = vi.fn();
        render(<MobilePerfWarning sheepCount={5000} onContinue={onContinue} onBack={onBack} />);
        fireEvent.click(screen.getByText('mobileWarning.continue'));
        expect(onContinue).toHaveBeenCalledTimes(1);
        expect(onBack).not.toHaveBeenCalled();
    });

    it('go back fires onBack, not onContinue (never a permanent block, just a step back)', () => {
        const onContinue = vi.fn();
        const onBack = vi.fn();
        render(<MobilePerfWarning sheepCount={5000} onContinue={onContinue} onBack={onBack} />);
        fireEvent.click(screen.getByText('mobileWarning.goBack'));
        expect(onBack).toHaveBeenCalledTimes(1);
        expect(onContinue).not.toHaveBeenCalled();
    });
});
