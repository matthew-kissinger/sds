// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Cycle 113 Phase 4 (D4): the tutorial arms inside the first round.
 *
 * The behaviour worth pinning is the gate, not the prompts (the machine has its
 * own spec). Three things must hold and each fails quietly:
 *
 *   a first-time player gets the prompts without accepting anything,
 *   a returning player gets nothing,
 *   and calling the gate twice does not stack two overlays on one round.
 *
 * The offer card is gone, so the removal is asserted at the module surface
 * rather than by rendering something that no longer exists.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// GameBridge reaches for the live game. The event bus is mocked with a real
// registry rather than a no-op, because 'scene-restart-to-menu' is how a
// session actually ends: firing it between tests is the same teardown the app
// performs, not a test-only back door into the module's private state.
const bus = vi.hoisted(() => new Map<string, Set<() => void>>());
vi.mock('../../js/GameBridge.js', () => ({
    waitForGameInstance: vi.fn(async () => ({})),
    selectDog: vi.fn(),
    getSelectedDog: vi.fn(() => 'jep'),
    getInputHandler: vi.fn(() => null),
    getGameState: vi.fn(() => null),
    getSceneManager: vi.fn(() => null),
    subscribeGameEvent: vi.fn((name: string, handler: () => void) => {
        if (!bus.has(name)) bus.set(name, new Set());
        bus.get(name)!.add(handler);
        return () => bus.get(name)!.delete(handler);
    }),
}));

const fireGameEvent = (name: string) => { for (const h of [...(bus.get(name) ?? [])]) h(); };

// The overlay is a react-i18next consumer with its own spec; the gate's job is
// to mount it, not to render its copy.
vi.mock('../../js/components/Tutorial/TutorialOverlay.js', () => ({
    TutorialOverlay: () => null,
}));

const {
    attachTutorial,
    maybeAttachFirstRunTutorial,
    isTutorialSessionActive,
} = await import('../../js/components/Tutorial/startTutorial.js');
const { TUTORIAL_DONE_KEY, markTutorialDone } = await import('../../js/components/Tutorial/tutorialMachine.js');

const overlayRoots = () => document.querySelectorAll('#tutorial-overlay-root');

/** Drain the deferred unmount teardown() schedules. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
});

afterEach(async () => {
    // Return the run to the menu, which is what ends a session in the app.
    fireGameEvent('scene-restart-to-menu');
    await settle();
    expect(isTutorialSessionActive()).toBe(false);
});

describe('maybeAttachFirstRunTutorial - the D4 gate', () => {
    it('mounts the prompts for a first-time player, with nothing accepted first', () => {
        expect(maybeAttachFirstRunTutorial()).toBe(true);
        expect(isTutorialSessionActive()).toBe(true);
        expect(overlayRoots()).toHaveLength(1);
    });

    it('mounts nothing for a player who has completed or dismissed it', () => {
        markTutorialDone();
        expect(localStorage.getItem(TUTORIAL_DONE_KEY)).toBe('1');
        expect(maybeAttachFirstRunTutorial()).toBe(false);
        expect(isTutorialSessionActive()).toBe(false);
        expect(overlayRoots()).toHaveLength(0);
    });

    it('does not stack a second overlay when the gate runs twice in one round', () => {
        expect(maybeAttachFirstRunTutorial()).toBe(true);
        expect(maybeAttachFirstRunTutorial()).toBe(false);
        expect(overlayRoots()).toHaveLength(1);
    });

    it('attachTutorial itself is ungated, so the Settings replay works when done', () => {
        markTutorialDone();
        expect(maybeAttachFirstRunTutorial()).toBe(false);
        expect(attachTutorial()).toBe(true);
        expect(isTutorialSessionActive()).toBe(true);
    });
});

describe('the offer card is gone', () => {
    const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

    it('deletes the component and its spec', () => {
        expect(existsSync(resolve(process.cwd(), 'js/components/Tutorial/TutorialOffer.tsx'))).toBe(false);
        expect(existsSync(resolve(process.cwd(), 'tests/ui/TutorialOffer.spec.tsx'))).toBe(false);
    });

    it('stops exporting it from the tutorial barrel', () => {
        // Matched against export statements only: the barrel's docblock says
        // the name out loud precisely to record that it went away.
        const exports = src('js/components/Tutorial/index.js').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(exports).not.toMatch(/TutorialOffer/);
    });

    it('deletes RailPortal with its only consumer', () => {
        // The rail itself (js/ui/overlayRail.js) stays; three toast paths use
        // it. RailPortal was the React wrapper and the offer card was all of it.
        expect(existsSync(resolve(process.cwd(), 'js/components/ui/RailPortal.tsx'))).toBe(false);
    });

    it('retires the offer copy from every locale rather than leaving it dead', () => {
        for (const loc of ['en', 'es', 'ja', 'pt', 'zh-CN']) {
            expect(src(`js/locales/${loc}/index.js`), loc).not.toMatch(/offerTitle|offerBody|offerStart|offerSkip/);
        }
    });

    it('arms from the entrance commit instead', () => {
        expect(src('js/components/App.js')).toMatch(/maybeAttachFirstRunTutorial\(\)/);
    });
});
