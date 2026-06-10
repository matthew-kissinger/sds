// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Toast hub (Cycle 87 Phase 5): queueing, gameplay suppression, and
 * max-visible policy for every notice that mounts into the shared top rail
 * (js/ui/overlayRail.js).
 *
 * Rules:
 * - Dedupe by id: re-enqueueing a live or queued id is a no-op.
 * - Max 2 visible (1 on compact mobile), FIFO within priority; 'critical'
 *   priority jumps the queue.
 * - `suppressDuringGameplay` toasts never show while `gameState.gameActive`
 *   is true: queued ones wait, visible ones are hidden and re-queued, and
 *   everything flushes when gameplay ends (same 250ms probe cadence
 *   rendererFallbackNotice.js used for its bespoke suppression).
 * - `durationMs: 0` means persistent (caller dismisses, e.g. the SW-update
 *   toast's Refresh button).
 *
 * Callers own their toast DOM: `mount(rowEl)` builds content into a rail row
 * the hub provides (rows default to pointer-events none; set 'auto' on
 * interactive content) and may return a cleanup function. The hub owns
 * placement, stacking, timers, and lifecycle.
 *
 * Vanilla JS with injectable deps so vitest covers the policy without a DOM
 * renderer.
 */

import { ensureTopRail } from './overlayRail.js';

/** Default toast lifetime. 0 = persistent. */
export const DEFAULT_TOAST_DURATION_MS = 4000;

/** Suppression probe cadence while anything suppressible is live/queued. */
export const GAMEPLAY_PROBE_INTERVAL_MS = 250;

export function defaultGameActiveProbe() {
    if (typeof window === 'undefined') return false;
    return window.__sds?.gameInstanceRef?.gameState?.gameActive === true;
}

function defaultIsCompactViewport() {
    if (typeof window === 'undefined') return false;
    const coarse = typeof window.matchMedia === 'function'
        && window.matchMedia('(pointer: coarse)').matches;
    return coarse && window.innerWidth <= 480;
}

const state = {
    queue: [],     // pending entries
    visible: [],   // mounted entries
    pollTimer: null,
    deps: null,
};

function resolveDeps(overrides = {}) {
    return {
        probe: overrides.probe ?? state.deps?.probe ?? defaultGameActiveProbe,
        rail: overrides.rail ?? state.deps?.rail ?? ensureTopRail,
        isCompact: overrides.isCompact ?? state.deps?.isCompact ?? defaultIsCompactViewport,
        setTimer: overrides.setTimer ?? state.deps?.setTimer ?? ((fn, ms) => setTimeout(fn, ms)),
        clearTimer: overrides.clearTimer ?? state.deps?.clearTimer ?? ((t) => clearTimeout(t)),
        setInterval: overrides.setInterval ?? state.deps?.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
        clearInterval: overrides.clearInterval ?? state.deps?.clearInterval ?? ((t) => clearInterval(t)),
    };
}

function maxVisible(deps) {
    return deps.isCompact() ? 1 : 2;
}

function findEntry(id) {
    return state.visible.find((e) => e.id === id) ?? state.queue.find((e) => e.id === id) ?? null;
}

function unmountEntry(entry, deps) {
    if (entry.timer) { deps.clearTimer(entry.timer); entry.timer = null; }
    try { entry.cleanup?.(); } catch { /* caller cleanup must not break the hub */ }
    entry.cleanup = null;
    try { entry.row?.remove(); } catch { /* ignore */ }
    entry.row = null;
    const i = state.visible.indexOf(entry);
    if (i >= 0) state.visible.splice(i, 1);
}

function mountEntry(entry, deps) {
    const rail = deps.rail();
    if (!rail) return false;
    const row = rail.ownerDocument.createElement('div');
    row.dataset.toastId = entry.id;
    Object.assign(row.style, {
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
        order: String(entry.order ?? 0),
    });
    rail.appendChild(row);
    entry.row = row;
    try {
        entry.cleanup = entry.mount(row) ?? null;
    } catch {
        try { row.remove(); } catch { /* ignore */ }
        return false;
    }
    state.visible.push(entry);
    if (entry.durationMs > 0) {
        entry.timer = deps.setTimer(() => dismissToast(entry.id), entry.durationMs);
    }
    return true;
}

function drain(deps) {
    const active = deps.probe();
    // Gameplay started: hide suppressible visible toasts, back to queue front.
    if (active) {
        const toHide = state.visible.filter((e) => e.suppressDuringGameplay);
        for (const e of toHide) {
            unmountEntry(e, deps);
            state.queue.unshift(e);
        }
    }
    while (state.visible.length < maxVisible(deps)) {
        const idx = state.queue.findIndex((e) => !(active && e.suppressDuringGameplay));
        if (idx < 0) break;
        const [entry] = state.queue.splice(idx, 1);
        if (!mountEntry(entry, deps)) break;
    }
    syncPoll(deps);
}

function hasSuppressible() {
    return state.queue.some((e) => e.suppressDuringGameplay)
        || state.visible.some((e) => e.suppressDuringGameplay);
}

function syncPoll(deps) {
    const need = hasSuppressible();
    if (need && !state.pollTimer) {
        state.pollTimer = deps.setInterval(() => drain(deps), GAMEPLAY_PROBE_INTERVAL_MS);
    } else if (!need && state.pollTimer) {
        deps.clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
}

/**
 * Enqueue (or no-op on a duplicate id). Returns a handle whose dismiss()
 * removes the toast whether queued or visible.
 *
 * @param {{
 *   id: string,
 *   mount: (rowEl: HTMLElement) => (void | (() => void)),
 *   durationMs?: number,
 *   suppressDuringGameplay?: boolean,
 *   priority?: 'info'|'critical',
 *   order?: number,
 * }} opts
 * @param {object} [deps] Injectable for tests.
 * @returns {{ dismiss: () => void }}
 */
export function enqueueToast(opts, deps = {}) {
    const d = resolveDeps(deps);
    state.deps = d;
    if (!opts?.id || typeof opts.mount !== 'function') return { dismiss() {} };
    if (findEntry(opts.id)) return { dismiss: () => dismissToast(opts.id) };
    const entry = {
        id: opts.id,
        mount: opts.mount,
        durationMs: opts.durationMs ?? DEFAULT_TOAST_DURATION_MS,
        suppressDuringGameplay: opts.suppressDuringGameplay !== false,
        priority: opts.priority ?? 'info',
        order: opts.order ?? 0,
        row: null,
        cleanup: null,
        timer: null,
    };
    if (entry.priority === 'critical') {
        const firstInfo = state.queue.findIndex((e) => e.priority !== 'critical');
        if (firstInfo >= 0) state.queue.splice(firstInfo, 0, entry);
        else state.queue.push(entry);
    } else {
        state.queue.push(entry);
    }
    drain(d);
    return { dismiss: () => dismissToast(opts.id) };
}

/** Dismiss a toast by id (queued or visible), then promote the next. */
export function dismissToast(id) {
    const deps = state.deps ?? resolveDeps();
    const queued = state.queue.findIndex((e) => e.id === id);
    if (queued >= 0) {
        state.queue.splice(queued, 1);
        syncPoll(deps);
        return;
    }
    const entry = state.visible.find((e) => e.id === id);
    if (!entry) return;
    unmountEntry(entry, deps);
    drain(deps);
}

/** Currently mounted toast ids, rail order (test/inspection surface). */
export function visibleToastIds() {
    return state.visible.map((e) => e.id);
}

/** Queued (not yet visible) toast ids (test/inspection surface). */
export function queuedToastIds() {
    return state.queue.map((e) => e.id);
}

/** Test hook: unmount everything and clear all state. */
export function _resetToastHubForTests() {
    const deps = state.deps ?? resolveDeps();
    for (const e of [...state.visible]) unmountEntry(e, deps);
    state.queue.length = 0;
    if (state.pollTimer) {
        deps.clearInterval(state.pollTimer);
        state.pollTimer = null;
    }
    state.deps = null;
}
