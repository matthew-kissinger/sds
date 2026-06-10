// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-MOBILE-FALLBACK: the WebGPU -> WebGL fallback notice gating.
 *
 * Pure-logic suite (node environment): the decision function over rendererMode
 * shapes, and the orchestrator with injected sessionStorage/toast/telemetry.
 * Core contract: an involuntary (capability-driven) fallback notifies exactly
 * once per session; an explicit `?renderer=webgl` run never notifies.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    decideRendererFallbackNotice,
    maybeNotifyRendererFallback,
    RENDERER_FALLBACK_NOTICE_KEY,
} from '../../js/rendering/rendererFallbackNotice.js';

function fakeStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return {
        getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
        setItem: (k: string, v: string) => { map.set(k, v); },
        map,
    };
}

function throwingStorage() {
    return {
        getItem: () => { throw new Error('denied'); },
        setItem: () => { throw new Error('denied'); },
    };
}

/** rendererMode as index.html resolves it for an involuntary fallback. */
const involuntaryMode = {
    requested: 'webgpu',
    effective: 'webgl',
    fallbackReason: 'webgpu-unavailable',
    webgpuApiAvailable: false,
};

/** rendererMode for an explicit ?renderer=webgl run: no fallbackReason. */
const explicitWebglMode = {
    requested: 'webgl',
    effective: 'webgl',
    fallbackReason: null,
    webgpuApiAvailable: true,
};

describe('decideRendererFallbackNotice', () => {
    it('notifies on an involuntary fallback (effective webgl + fallbackReason)', () => {
        expect(decideRendererFallbackNotice({ rendererMode: involuntaryMode }))
            .toEqual({ notify: true, reason: 'webgpu-unavailable' });
    });

    it('stays silent for explicit ?renderer=webgl (no fallbackReason)', () => {
        expect(decideRendererFallbackNotice({ rendererMode: explicitWebglMode }))
            .toEqual({ notify: false, reason: null });
    });

    it('stays silent when WebGPU actually shipped', () => {
        expect(decideRendererFallbackNotice({
            rendererMode: { requested: 'webgpu', effective: 'webgpu-production', fallbackReason: null },
        })).toEqual({ notify: false, reason: null });
    });

    it('stays silent once the session guard is set', () => {
        expect(decideRendererFallbackNotice({ rendererMode: involuntaryMode, alreadyNoticed: true }))
            .toEqual({ notify: false, reason: null });
    });

    it('stays silent with no rendererMode record at all', () => {
        expect(decideRendererFallbackNotice({ rendererMode: null }))
            .toEqual({ notify: false, reason: null });
    });

    it('picks up an explicit ?fallbackReason= carried in the URL', () => {
        // Such a load sets ?renderer=webgl, so rendererMode carries no reason;
        // the URL param is the involuntary signal.
        expect(decideRendererFallbackNotice({
            rendererMode: explicitWebglMode,
            urlFallbackReason: 'webgpu-frame-budget',
        })).toEqual({ notify: true, reason: 'webgpu-frame-budget' });
    });

    it('prefers the rendererMode reason over the URL reason', () => {
        expect(decideRendererFallbackNotice({
            rendererMode: { ...involuntaryMode, fallbackReason: 'production-webgpu-boot-failed' },
            urlFallbackReason: 'webgpu-frame-budget',
        })).toEqual({ notify: true, reason: 'production-webgpu-boot-failed' });
    });
});

describe('maybeNotifyRendererFallback', () => {
    it('involuntary fallback: shows once, emits once, sets the session guard', () => {
        const storage = fakeStorage();
        const showNotice = vi.fn();
        const emit = vi.fn();
        const first = maybeNotifyRendererFallback({
            rendererMode: involuntaryMode, search: '', storage, showNotice, emit,
        });
        expect(first).toEqual({ notify: true, reason: 'webgpu-unavailable' });
        expect(showNotice).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith('renderer_fallback', {
            reason: 'webgpu-unavailable',
            requested: 'webgpu',
            webgpuApiAvailable: false,
        });
        expect(storage.map.get(RENDERER_FALLBACK_NOTICE_KEY)).toBe('1');

        // Second call in the same session (e.g. a scene swap re-running the
        // boot path): no re-toast, no second event.
        const second = maybeNotifyRendererFallback({
            rendererMode: involuntaryMode, search: '', storage, showNotice, emit,
        });
        expect(second).toEqual({ notify: false, reason: null });
        expect(showNotice).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('explicit ?renderer=webgl: never shows, never emits, leaves storage alone', () => {
        const storage = fakeStorage();
        const showNotice = vi.fn();
        const emit = vi.fn();
        const decision = maybeNotifyRendererFallback({
            rendererMode: explicitWebglMode, search: '?renderer=webgl', storage, showNotice, emit,
        });
        expect(decision).toEqual({ notify: false, reason: null });
        expect(showNotice).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
        expect(storage.map.has(RENDERER_FALLBACK_NOTICE_KEY)).toBe(false);
    });

    it('auto-fallback reload (?renderer=webgl&fallbackReason=...) still notifies', () => {
        const storage = fakeStorage();
        const showNotice = vi.fn();
        const emit = vi.fn();
        const decision = maybeNotifyRendererFallback({
            rendererMode: { ...explicitWebglMode, requested: 'webgl' },
            search: '?renderer=webgl&fallbackReason=webgpu-frame-budget',
            storage, showNotice, emit,
        });
        expect(decision).toEqual({ notify: true, reason: 'webgpu-frame-budget' });
        expect(showNotice).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledWith('renderer_fallback', expect.objectContaining({
            reason: 'webgpu-frame-budget',
        }));
    });

    it('survives a storage that throws (private mode) and still notifies', () => {
        const showNotice = vi.fn();
        const emit = vi.fn();
        const decision = maybeNotifyRendererFallback({
            rendererMode: involuntaryMode, search: '', storage: throwingStorage(), showNotice, emit,
        });
        expect(decision.notify).toBe(true);
        expect(showNotice).toHaveBeenCalledTimes(1);
        expect(emit).toHaveBeenCalledTimes(1);
    });

    it('survives a toast or telemetry sink that throws', () => {
        const storage = fakeStorage();
        const decision = maybeNotifyRendererFallback({
            rendererMode: involuntaryMode,
            search: '',
            storage,
            showNotice: () => { throw new Error('no DOM'); },
            emit: () => { throw new Error('no network'); },
        });
        expect(decision.notify).toBe(true);
        expect(storage.map.get(RENDERER_FALLBACK_NOTICE_KEY)).toBe('1');
    });

    it('no rendererMode record: no-op', () => {
        const showNotice = vi.fn();
        const emit = vi.fn();
        const decision = maybeNotifyRendererFallback({
            rendererMode: null, search: '', storage: fakeStorage(), showNotice, emit,
        });
        expect(decision).toEqual({ notify: false, reason: null });
        expect(showNotice).not.toHaveBeenCalled();
        expect(emit).not.toHaveBeenCalled();
    });
});
