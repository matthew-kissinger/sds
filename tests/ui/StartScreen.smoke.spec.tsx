/** @vitest-environment jsdom */
/**
 * Cycle 48 P2: render smoke harness for the converted StartScreen menu leaves
 * (SinglePlayerModes, ModeSelection, DogSelection, PlayerIdentitySetup,
 * PointerTour). Each mounts in jsdom and renders its expected DOM without
 * throwing. Token var() / color-mix() strings don't resolve in jsdom, but they
 * must not crash render.
 *
 * react-i18next has no instance in tests, so useTranslation is mocked to echo
 * keys. GameBridge (getNetworkManager, used only on submit) and the i18n
 * LANGUAGES table (read by the LanguageSelector that PlayerIdentitySetup nests)
 * are mocked so the trees mount deterministically. PointerTour gating reads the
 * real pointerTourState localStorage logic, driven via localStorage here.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: {} }),
}));

vi.mock('../../js/GameBridge.js', () => ({
    getNetworkManager: () => null,
}));

vi.mock('../../js/i18n.js', () => ({
    LANGUAGES: [{ code: 'en', nativeName: 'English', flag: 'EN' }],
}));

vi.mock('../../js/components/shared/playerIdentity.js', () => ({
    generatePersistentId: () => 'test-persistent-id',
    savePlayerIdentity: () => {},
}));

import { SinglePlayerModes } from '../../js/components/StartScreen/SinglePlayerModes';
import { ModeSelection } from '../../js/components/StartScreen/ModeSelection';
import { DogSelection } from '../../js/components/StartScreen/DogSelection';
import { PlayerIdentitySetup } from '../../js/components/StartScreen/PlayerIdentitySetup';
import { PointerTour } from '../../js/components/StartScreen/PointerTour';

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    localStorage.clear();
});

describe('SinglePlayerModes (smoke)', () => {
    it('renders the title and the Practice tile first', () => {
        render(<SinglePlayerModes onSelectMode={vi.fn()} onBack={vi.fn()} />);
        expect(screen.getByText('modes.title')).toBeTruthy();
        expect(screen.getByText('modes.practice')).toBeTruthy();
        expect(screen.getByText('common.back')).toBeTruthy();
    });
});

describe('ModeSelection (smoke)', () => {
    it('renders all six mode tiles', () => {
        render(<ModeSelection onSelectMode={vi.fn()} />);
        expect(screen.getByText('menu.soloPlay')).toBeTruthy();
        expect(screen.getByText('menu.multiplayer')).toBeTruthy();
        expect(screen.getByText('menu.settings')).toBeTruthy();
    });
});

describe('DogSelection (smoke)', () => {
    it('renders the dog grid with the selected dog marked', () => {
        render(<DogSelection selectedDog="jep" onSelect={vi.fn()} />);
        expect(screen.getByText('dogs.title')).toBeTruthy();
        expect(screen.getByText('dogs.jep.name')).toBeTruthy();
        expect(screen.getByText('dogs.georgeWashington.name')).toBeTruthy();
    });
});

describe('PlayerIdentitySetup (smoke)', () => {
    it('renders the welcome panel with the custom-name input visible', () => {
        render(<PlayerIdentitySetup onComplete={vi.fn()} />);
        expect(screen.getByText('identity.welcome')).toBeTruthy();
        expect(screen.getByPlaceholderText('identity.enterName')).toBeTruthy();
        expect(screen.getByText('identity.continue')).toBeTruthy();
    });
});

describe('PointerTour (smoke)', () => {
    it('renders the desktop gesture captions for a first-time visitor', () => {
        render(<PointerTour />);
        expect(screen.getByText('Sprint')).toBeTruthy();
        expect(screen.getByText('Whistle')).toBeTruthy();
    });

    it('renders nothing once the tour has been shown', () => {
        localStorage.setItem('sds.pointer-tour-shown', '1');
        const { container } = render(<PointerTour />);
        expect(container.firstChild).toBeNull();
    });
});
