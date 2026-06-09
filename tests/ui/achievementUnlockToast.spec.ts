// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Achievement unlock toast - [P3-ACHIEVE-UI].
 *
 * jsdom suite over js/achievements/unlockToast.js:
 *   - mountAchievementToast: appears with role=status, never blocks input
 *     (pointer-events none), self-dismisses on fake timers.
 *   - installUnlockToast: subscribes exactly once (idempotent), routes
 *     unlock ids to the show sink, and uninstall stops the routing.
 *   - end to end: a real engine recordEvent unlock surfaces a toast with
 *     the localized framing + name (the real shared i18n instance, which
 *     initializes fine under jsdom with the bundled en resources).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    installUnlockToast,
    mountAchievementToast,
    TOAST_DURATION_MS,
    TOAST_CONTAINER_ID,
} from '../../js/achievements/unlockToast.js';
import { recordEvent, _resetForTests } from '../../js/achievements/engine.js';

let uninstall: (() => void) | null = null;

beforeEach(() => {
    localStorage.clear();
    _resetForTests();
});

afterEach(() => {
    uninstall?.();
    uninstall = null;
    _resetForTests();
    localStorage.clear();
    document.getElementById(TOAST_CONTAINER_ID)?.remove();
    vi.useRealTimers();
});

describe('mountAchievementToast', () => {
    it('mounts a polite, non-blocking toast', () => {
        const el = mountAchievementToast('Achievement unlocked', 'First Pen');
        expect(el).toBeTruthy();
        expect(el!.getAttribute('role')).toBe('status');
        expect(el!.getAttribute('aria-live')).toBe('polite');
        expect(el!.style.pointerEvents).toBe('none');
        expect(el!.textContent).toContain('Achievement unlocked');
        expect(el!.textContent).toContain('First Pen');
        const container = document.getElementById(TOAST_CONTAINER_ID)!;
        expect(container.style.pointerEvents).toBe('none');
        expect(container.contains(el)).toBe(true);
    });

    it('self-dismisses after TOAST_DURATION_MS (fake timers)', () => {
        vi.useFakeTimers();
        const el = mountAchievementToast('Achievement unlocked', 'First Pen')!;
        expect(document.body.contains(el)).toBe(true);

        // Just before the deadline it is still mounted.
        vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
        expect(document.body.contains(el)).toBe(true);

        // Deadline + the 300ms fade-out removes it, and the empty container too.
        vi.advanceTimersByTime(1 + 300);
        expect(document.body.contains(el)).toBe(false);
        expect(document.getElementById(TOAST_CONTAINER_ID)).toBeNull();
    });

    it('stacks multiple toasts instead of overwriting (multi-unlock events)', () => {
        vi.useFakeTimers();
        mountAchievementToast('Achievement unlocked', 'First Pen');
        mountAchievementToast('Achievement unlocked', 'Home Field Classic');
        const container = document.getElementById(TOAST_CONTAINER_ID)!;
        expect(container.childElementCount).toBe(2);
        vi.advanceTimersByTime(TOAST_DURATION_MS + 300);
        expect(document.getElementById(TOAST_CONTAINER_ID)).toBeNull();
    });
});

describe('installUnlockToast', () => {
    it('routes unlock ids to the show sink', () => {
        let captured: ((id: string, at: string) => void) | null = null;
        const show = vi.fn();
        uninstall = installUnlockToast({
            subscribe: (cb) => { captured = cb; return () => { captured = null; }; },
            show,
        });
        expect(captured).toBeTypeOf('function');
        captured!('first-pen', '2026-06-09T00:00:00.000Z');
        expect(show).toHaveBeenCalledTimes(1);
        expect(show).toHaveBeenCalledWith('first-pen');
    });

    it('is idempotent: a second install while active is a no-op', () => {
        const subscribe = vi.fn(() => () => {});
        uninstall = installUnlockToast({ subscribe, show: vi.fn() });
        const second = installUnlockToast({ subscribe, show: vi.fn() });
        expect(subscribe).toHaveBeenCalledTimes(1);
        second();
    });

    it('uninstall unsubscribes and allows a clean reinstall', () => {
        let captured: ((id: string, at: string) => void) | null = null;
        const show = vi.fn();
        const subscribe = (cb: (id: string, at: string) => void) => {
            captured = cb;
            return () => { captured = null; };
        };
        uninstall = installUnlockToast({ subscribe, show });
        uninstall();
        uninstall = null;
        expect(captured).toBeNull();

        uninstall = installUnlockToast({ subscribe, show });
        expect(captured).toBeTypeOf('function');
    });

    it('a throwing show sink never reaches the unlock path', () => {
        let captured: ((id: string, at: string) => void) | null = null;
        uninstall = installUnlockToast({
            subscribe: (cb) => { captured = cb; return () => {}; },
            show: () => { throw new Error('no DOM'); },
        });
        expect(() => captured!('first-pen', '2026-06-09T00:00:00.000Z')).not.toThrow();
    });
});

describe('end to end: engine unlock surfaces a toast', () => {
    it('recordEvent -> onUnlock -> toast DOM with localized framing + name', async () => {
        uninstall = installUnlockToast();

        recordEvent('solo-complete', {
            sceneId: 'field', mode: 'classic', gameMode: 'solo',
            dog: 'jep', finalTime: 187.4, totalSheep: 200,
        });

        // The default show path lazy-imports the (mocked) i18n module; wait
        // for both unlock toasts to land (the import settles asynchronously).
        // This event unlocks first-pen and pen-200-home-field, so the two
        // toasts stack.
        await vi.waitFor(() => {
            expect(document.getElementById(TOAST_CONTAINER_ID)?.childElementCount).toBeGreaterThanOrEqual(2);
        });
        const container = document.getElementById(TOAST_CONTAINER_ID);
        expect(container).toBeTruthy();
        expect(container!.textContent).toContain('Achievement unlocked');
        expect(container!.textContent).toContain('First Pen');
        expect(container!.textContent).toContain('Home Field Classic');
    });

    it('an already-unlocked achievement does not re-toast', async () => {
        uninstall = installUnlockToast();
        const payload = {
            sceneId: 'field', mode: 'classic', gameMode: 'solo',
            dog: 'jep', finalTime: 187.4, totalSheep: 200,
        };
        recordEvent('solo-complete', payload);
        await vi.waitFor(() => {
            expect(document.getElementById(TOAST_CONTAINER_ID)?.childElementCount).toBe(2);
        });

        recordEvent('solo-complete', payload);
        // Give any (wrong) re-toast time to land before asserting stability.
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(document.getElementById(TOAST_CONTAINER_ID)!.childElementCount).toBe(2);
    });
});
