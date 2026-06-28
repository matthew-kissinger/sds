// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/** @vitest-environment jsdom */
/**
 * Toast hub (Cycle 87 Phase 5): queue, dedupe, max-visible, gameplay
 * suppression, and dismissal-promotes-next. The probe is injected so no
 * game instance is needed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    enqueueToast,
    dismissToast,
    visibleToastIds,
    queuedToastIds,
    _resetToastHubForTests,
    GAMEPLAY_PROBE_INTERVAL_MS,
} from '../../js/ui/toastHub.js';
import { TOP_RAIL_ID } from '../../js/ui/overlayRail.js';

const mountSpy = () => {
    const fn = vi.fn((rowEl: HTMLElement) => {
        const el = rowEl.ownerDocument.createElement('div');
        el.textContent = 'toast';
        rowEl.appendChild(el);
    });
    return fn;
};

afterEach(() => {
    _resetToastHubForTests();
    document.getElementById(TOP_RAIL_ID)?.remove();
    vi.useRealTimers();
});

describe('enqueueToast', () => {
    it('places the shared rail above the React overlay host', () => {
        const mount = mountSpy();
        enqueueToast({ id: 'a', mount }, { probe: () => false });
        const rail = document.getElementById(TOP_RAIL_ID)!;
        expect(Number(rail.style.zIndex)).toBeGreaterThan(1000);
    });

    it('mounts immediately when idle, into the shared rail', () => {
        const mount = mountSpy();
        enqueueToast({ id: 'a', mount }, { probe: () => false });
        expect(mount).toHaveBeenCalledTimes(1);
        expect(visibleToastIds()).toEqual(['a']);
        expect(document.querySelector(`#${TOP_RAIL_ID} [data-toast-id="a"]`)).not.toBeNull();
    });

    it('dedupes by id across queue and visible', () => {
        const first = mountSpy();
        const second = mountSpy();
        enqueueToast({ id: 'a', mount: first }, { probe: () => false });
        enqueueToast({ id: 'a', mount: second }, { probe: () => false });
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
        expect(visibleToastIds()).toEqual(['a']);
    });

    it('caps visible toasts at 2 and promotes FIFO on dismissal', () => {
        const deps = { probe: () => false };
        enqueueToast({ id: 'a', mount: mountSpy(), durationMs: 0 }, deps);
        enqueueToast({ id: 'b', mount: mountSpy(), durationMs: 0 }, deps);
        enqueueToast({ id: 'c', mount: mountSpy(), durationMs: 0 }, deps);
        expect(visibleToastIds()).toEqual(['a', 'b']);
        expect(queuedToastIds()).toEqual(['c']);
        dismissToast('a');
        expect(visibleToastIds()).toEqual(['b', 'c']);
    });

    it('caps visible at 1 on compact viewports', () => {
        const deps = { probe: () => false, isCompact: () => true };
        enqueueToast({ id: 'a', mount: mountSpy(), durationMs: 0 }, deps);
        enqueueToast({ id: 'b', mount: mountSpy(), durationMs: 0 }, deps);
        expect(visibleToastIds()).toEqual(['a']);
        expect(queuedToastIds()).toEqual(['b']);
    });

    it('critical priority jumps the queue', () => {
        const deps = { probe: () => false };
        enqueueToast({ id: 'a', mount: mountSpy(), durationMs: 0 }, deps);
        enqueueToast({ id: 'b', mount: mountSpy(), durationMs: 0 }, deps);
        enqueueToast({ id: 'c', mount: mountSpy(), durationMs: 0 }, deps);
        enqueueToast({ id: 'urgent', mount: mountSpy(), durationMs: 0, priority: 'critical' }, deps);
        expect(queuedToastIds()).toEqual(['urgent', 'c']);
    });

    it('self-dismisses after durationMs; persistent (0) survives', () => {
        vi.useFakeTimers();
        const deps = { probe: () => false };
        enqueueToast({ id: 'short', mount: mountSpy(), durationMs: 1000 }, deps);
        enqueueToast({ id: 'forever', mount: mountSpy(), durationMs: 0 }, deps);
        vi.advanceTimersByTime(1001);
        expect(visibleToastIds()).toEqual(['forever']);
        vi.advanceTimersByTime(60_000);
        expect(visibleToastIds()).toEqual(['forever']);
    });

    it('a throwing mount never breaks the hub', () => {
        const deps = { probe: () => false };
        enqueueToast({ id: 'boom', mount: () => { throw new Error('boom'); } }, deps);
        enqueueToast({ id: 'ok', mount: mountSpy() }, deps);
        expect(visibleToastIds()).toContain('ok');
    });
});

describe('gameplay suppression', () => {
    it('suppressible toasts wait while gameplay is active and flush after', () => {
        vi.useFakeTimers();
        let active = true;
        const mount = mountSpy();
        enqueueToast({ id: 'a', mount, suppressDuringGameplay: true }, { probe: () => active });
        expect(mount).not.toHaveBeenCalled();
        expect(queuedToastIds()).toEqual(['a']);
        active = false;
        vi.advanceTimersByTime(GAMEPLAY_PROBE_INTERVAL_MS + 10);
        expect(mount).toHaveBeenCalledTimes(1);
        expect(visibleToastIds()).toEqual(['a']);
    });

    it('non-suppressible toasts show during gameplay (achievements)', () => {
        const mount = mountSpy();
        enqueueToast({ id: 'ach', mount, suppressDuringGameplay: false }, { probe: () => true });
        expect(mount).toHaveBeenCalledTimes(1);
    });

    it('a visible suppressible toast hides when gameplay starts and returns after', () => {
        vi.useFakeTimers();
        let active = false;
        enqueueToast({ id: 'sw', mount: mountSpy(), durationMs: 0, suppressDuringGameplay: true }, { probe: () => active });
        expect(visibleToastIds()).toEqual(['sw']);
        active = true;
        vi.advanceTimersByTime(GAMEPLAY_PROBE_INTERVAL_MS + 10);
        expect(visibleToastIds()).toEqual([]);
        expect(queuedToastIds()).toEqual(['sw']);
        active = false;
        vi.advanceTimersByTime(GAMEPLAY_PROBE_INTERVAL_MS + 10);
        expect(visibleToastIds()).toEqual(['sw']);
    });
});

describe('dismissToast', () => {
    it('removes a queued toast without mounting it', () => {
        const deps = { probe: () => true };
        const mount = mountSpy();
        enqueueToast({ id: 'q', mount, suppressDuringGameplay: true }, deps);
        dismissToast('q');
        expect(queuedToastIds()).toEqual([]);
        expect(mount).not.toHaveBeenCalled();
    });

    it('runs the mount cleanup on dismissal', () => {
        const cleanup = vi.fn();
        enqueueToast({ id: 'c', mount: () => cleanup, durationMs: 0 }, { probe: () => false });
        dismissToast('c');
        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(document.querySelector(`[data-toast-id="c"]`)).toBeNull();
    });
});
