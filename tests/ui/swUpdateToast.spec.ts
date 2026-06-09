// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
// @vitest-environment jsdom
/**
 * P4-SW-TOAST: service-worker update toast.
 *
 * sw.js promotes new workers immediately (skipWaiting + clients.claim), so a
 * deploy mid-session fires `controllerchange` on navigator.serviceWorker.
 * Core contract:
 *   - controllerchange on an already-controlled page -> persistent toast
 *     with a Refresh button.
 *   - controllerchange from the INITIAL claim (no prior controller) -> no
 *     toast; only a SUBSEQUENT change toasts.
 *   - the Refresh button triggers the injected reload; nothing auto-reloads.
 *
 * The container is a hand-rolled double (jsdom has no navigator.serviceWorker)
 * and reload is injected, so no real navigation ever happens.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    SW_UPDATE_TOAST_ID,
    installSwUpdateToast,
    mountSwUpdateToast,
} from '../../js/boot/swUpdateToast.js';

type Listener = () => void;

/** Minimal navigator.serviceWorker double. */
function makeContainer({ controlled }: { controlled: boolean }) {
    const listeners = new Set<Listener>();
    return {
        controller: controlled ? {} : null,
        addEventListener(type: string, cb: Listener) {
            if (type === 'controllerchange') listeners.add(cb);
        },
        removeEventListener(type: string, cb: Listener) {
            if (type === 'controllerchange') listeners.delete(cb);
        },
        /** Simulate a new SW taking control (sets controller, then fires). */
        takeControl() {
            this.controller = {};
            for (const cb of [...listeners]) cb();
        },
        listenerCount: () => listeners.size,
    };
}

const uninstalls: Array<() => void> = [];

function install(deps: Parameters<typeof installSwUpdateToast>[0]) {
    const uninstall = installSwUpdateToast(deps);
    uninstalls.push(uninstall);
    return uninstall;
}

afterEach(() => {
    // installSwUpdateToast has a module-level idempotence guard; uninstall
    // between tests so each spec gets a fresh install.
    while (uninstalls.length) uninstalls.pop()!();
    document.getElementById(SW_UPDATE_TOAST_ID)?.remove();
});

describe('installSwUpdateToast', () => {
    it('toasts when a new SW takes control of an already-controlled page', () => {
        const container = makeContainer({ controlled: true });
        const show = vi.fn();
        install({ container, show });
        container.takeControl();
        expect(show).toHaveBeenCalledTimes(1);
    });

    it('does not toast on the initial claim (no prior controller)', () => {
        const container = makeContainer({ controlled: false });
        const show = vi.fn();
        install({ container, show });
        container.takeControl(); // first SW install claiming the page
        expect(show).not.toHaveBeenCalled();
    });

    it('toasts on the change AFTER the initial claim', () => {
        const container = makeContainer({ controlled: false });
        const show = vi.fn();
        install({ container, show });
        container.takeControl(); // initial claim - silent
        container.takeControl(); // a real update
        expect(show).toHaveBeenCalledTimes(1);
    });

    it('shows at most once per install on repeated controller changes', () => {
        const container = makeContainer({ controlled: true });
        const show = vi.fn();
        install({ container, show });
        container.takeControl();
        container.takeControl();
        expect(show).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: a second install while active is a no-op', () => {
        const container = makeContainer({ controlled: true });
        const show = vi.fn();
        install({ container, show });
        install({ container, show });
        expect(container.listenerCount()).toBe(1);
        container.takeControl();
        expect(show).toHaveBeenCalledTimes(1);
    });

    it('no-ops without a service-worker container', () => {
        expect(() => install({ container: null, show: vi.fn() })).not.toThrow();
    });

    it('uninstall removes the listener', () => {
        const container = makeContainer({ controlled: true });
        const show = vi.fn();
        const uninstall = install({ container, show });
        uninstall();
        container.takeControl();
        expect(show).not.toHaveBeenCalled();
        expect(container.listenerCount()).toBe(0);
    });
});

describe('mountSwUpdateToast', () => {
    it('mounts a persistent toast with the body text and a Refresh button', () => {
        vi.useFakeTimers();
        try {
            const root = mountSwUpdateToast('A new version is ready.', 'Refresh', {
                reload: vi.fn(),
            });
            expect(root).not.toBeNull();
            const el = document.getElementById(SW_UPDATE_TOAST_ID)!;
            expect(el.textContent).toContain('A new version is ready.');
            const button = el.querySelector('button')!;
            expect(button.textContent).toBe('Refresh');
            expect(el.getAttribute('role')).toBe('status');
            // Persistent: no self-dismissal, even well past any toast lifetime.
            vi.advanceTimersByTime(60_000);
            expect(document.getElementById(SW_UPDATE_TOAST_ID)).not.toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('the Refresh button triggers the injected reload', () => {
        const reload = vi.fn();
        mountSwUpdateToast('A new version is ready.', 'Refresh', { reload });
        const button = document
            .getElementById(SW_UPDATE_TOAST_ID)!
            .querySelector('button')!;
        expect(reload).not.toHaveBeenCalled(); // never auto-reloads
        button.click();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('dedupes: a second mount while one is visible returns null', () => {
        const first = mountSwUpdateToast('A new version is ready.', 'Refresh', {
            reload: vi.fn(),
        });
        const second = mountSwUpdateToast('A new version is ready.', 'Refresh', {
            reload: vi.fn(),
        });
        expect(first).not.toBeNull();
        expect(second).toBeNull();
        expect(document.querySelectorAll(`#${SW_UPDATE_TOAST_ID}`)).toHaveLength(1);
    });
});

describe('install -> toast end to end (DOM)', () => {
    it('controllerchange with a prior controller mounts the toast; refresh reloads', () => {
        const container = makeContainer({ controlled: true });
        const reload = vi.fn();
        install({
            container,
            show: () => mountSwUpdateToast('A new version is ready.', 'Refresh', { reload }),
        });
        expect(document.getElementById(SW_UPDATE_TOAST_ID)).toBeNull();
        container.takeControl();
        const el = document.getElementById(SW_UPDATE_TOAST_ID);
        expect(el).not.toBeNull();
        el!.querySelector('button')!.click();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
