// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P4-CTX-RESTORE: graphics context-loss recovery state machine + wiring.
 *
 * Pure-logic suite (node environment): the recovery state machine with
 * injected overlay/reload/telemetry/timers, the WebGPU device-lost watch
 * against a fake renderer, and the webglcontextlost/-restored listener
 * wiring in installWebGLContextHandlers against a fake canvas element.
 * Core contract: exactly one overlay, one `context_lost` telemetry event,
 * and one reload per loss, no matter how the events race.
 */
import { describe, it, expect, vi } from 'vitest';
import {
    CONTEXT_RESTORE_TIMEOUT_MS,
    createContextLossRecovery,
    watchWebGpuDeviceLost,
} from '../../js/rendering/webglContextRecovery.js';
import { installWebGLContextHandlers } from '../../js/rendering/sceneRendererSetup.js';

const silentLogger = { log: () => {}, error: () => {} };

function makeRecovery(overrides: Record<string, unknown> = {}) {
    const calls = {
        overlay: 0,
        reloads: 0,
        events: [] as Array<{ name: string; props: Record<string, unknown> }>,
        timers: [] as Array<{ fn: () => void; ms: number }>,
        cleared: [] as number[],
    };
    const recovery = createContextLossRecovery({
        rendererKind: 'webgl',
        showOverlay: () => { calls.overlay += 1; },
        reload: () => { calls.reloads += 1; },
        emit: (name: string, props: Record<string, unknown>) => { calls.events.push({ name, props }); },
        setTimer: (fn: () => void, ms: number) => { calls.timers.push({ fn, ms }); return calls.timers.length - 1; },
        clearTimer: (id: number) => { calls.cleared.push(id); },
        logger: silentLogger,
        ...overrides,
    });
    return { recovery, calls };
}

describe('createContextLossRecovery', () => {
    it('shows the overlay and arms the restore-timeout on context lost', () => {
        const { recovery, calls } = makeRecovery();
        expect(recovery.onContextLost()).toBe(true);
        expect(calls.overlay).toBe(1);
        expect(calls.timers).toHaveLength(1);
        expect(calls.timers[0].ms).toBe(CONTEXT_RESTORE_TIMEOUT_MS);
        expect(calls.reloads).toBe(0);
        expect(recovery.isPending()).toBe(true);
    });

    it('reloads with outcome reload-restored when the context comes back', () => {
        const { recovery, calls } = makeRecovery();
        recovery.onContextLost();
        expect(recovery.onContextRestored()).toBe(true);
        expect(calls.reloads).toBe(1);
        expect(calls.cleared).toEqual([0]); // restore cancels the timeout
        expect(calls.events).toEqual([
            { name: 'context_lost', props: { renderer: 'webgl', outcome: 'reload-restored' } },
        ]);
        expect(recovery.isFinalized()).toBe(true);
    });

    it('reloads with outcome reload-timeout when restore never fires', () => {
        const { recovery, calls } = makeRecovery();
        recovery.onContextLost();
        calls.timers[0].fn(); // the 2s clock expires
        expect(calls.reloads).toBe(1);
        expect(calls.events[0].props.outcome).toBe('reload-timeout');
        expect(recovery.isFinalized()).toBe(true);
    });

    it('ignores a restored event with no preceding loss', () => {
        const { recovery, calls } = makeRecovery();
        expect(recovery.onContextRestored()).toBe(false);
        expect(calls.reloads).toBe(0);
        expect(calls.events).toHaveLength(0);
    });

    it('reloads exactly once however the events race', () => {
        const { recovery, calls } = makeRecovery();
        recovery.onContextLost();
        expect(recovery.onContextLost()).toBe(false); // duplicate loss is a no-op
        recovery.onContextRestored();
        expect(recovery.onContextRestored()).toBe(false);
        calls.timers[0].fn(); // late timer fire after finalize
        recovery.onDeviceLost('gpu-hang');
        expect(calls.overlay).toBe(1);
        expect(calls.reloads).toBe(1);
        expect(calls.events).toHaveLength(1);
    });

    it('onDeviceLost reloads immediately with the reason in the event', () => {
        const { recovery, calls } = makeRecovery({ rendererKind: 'webgpu' });
        expect(recovery.onDeviceLost('internal')).toBe(true);
        expect(calls.overlay).toBe(1);
        expect(calls.reloads).toBe(1);
        expect(calls.events).toEqual([
            { name: 'context_lost', props: { renderer: 'webgpu', outcome: 'reload-device-lost', reason: 'internal' } },
        ]);
    });

    it('still reloads when the overlay or telemetry throw', () => {
        const { recovery, calls } = makeRecovery({
            showOverlay: () => { throw new Error('no DOM'); },
            emit: () => { throw new Error('offline'); },
        });
        recovery.onContextLost();
        recovery.onContextRestored();
        expect(calls.reloads).toBe(1);
    });
});

describe('watchWebGpuDeviceLost', () => {
    function fakeWebGpuRenderer(lostPromise: Promise<unknown> | null) {
        return {
            isWebGPURenderer: true,
            backend: lostPromise ? { device: { lost: lostPromise } } : {},
        } as Record<string, unknown> & { backend: { device?: { lost: Promise<unknown> } } };
    }

    it('fires onDeviceLost for a real device loss', async () => {
        let resolveLost!: (info: unknown) => void;
        const renderer = fakeWebGpuRenderer(new Promise((r) => { resolveLost = r; }));
        const onDeviceLost = vi.fn();
        const installed = watchWebGpuDeviceLost(renderer, {
            recovery: { onDeviceLost } as never,
            logger: silentLogger,
        });
        expect(installed).toBe(true);
        resolveLost({ reason: 'unknown', message: 'GPU reset' });
        await Promise.resolve(); // flush the .then chain
        await Promise.resolve();
        expect(onDeviceLost).toHaveBeenCalledWith('unknown');
    });

    it('skips an intentional destroy (reason destroyed)', async () => {
        const renderer = fakeWebGpuRenderer(Promise.resolve({ reason: 'destroyed' }));
        const onDeviceLost = vi.fn();
        watchWebGpuDeviceLost(renderer, { recovery: { onDeviceLost } as never, logger: silentLogger });
        await Promise.resolve();
        await Promise.resolve();
        expect(onDeviceLost).not.toHaveBeenCalled();
    });

    it('polls until the device exists, then attaches', async () => {
        const renderer = fakeWebGpuRenderer(null); // device not created yet
        const timers: Array<() => void> = [];
        const onDeviceLost = vi.fn();
        watchWebGpuDeviceLost(renderer, {
            recovery: { onDeviceLost } as never,
            setTimer: (fn: () => void) => { timers.push(fn); return timers.length; },
            logger: silentLogger,
        });
        expect(timers).toHaveLength(1); // first poll found nothing, re-armed
        renderer.backend.device = { lost: Promise.resolve({ reason: 'unknown' }) };
        timers[0]();
        expect(timers).toHaveLength(1); // attached, no further polls
        await Promise.resolve();
        await Promise.resolve();
        expect(onDeviceLost).toHaveBeenCalledWith('unknown');
    });

    it('gives up quietly after maxPolls and never double-installs', () => {
        const renderer = fakeWebGpuRenderer(null);
        const timers: Array<() => void> = [];
        expect(watchWebGpuDeviceLost(renderer, {
            recovery: { onDeviceLost: vi.fn() } as never,
            maxPolls: 2,
            setTimer: (fn: () => void) => { timers.push(fn); return timers.length; },
            logger: silentLogger,
        })).toBe(true);
        timers[0]();
        timers[1]();
        expect(timers).toHaveLength(2); // poll 3 exceeded maxPolls, stopped
        expect(watchWebGpuDeviceLost(renderer, { logger: silentLogger })).toBe(false);
    });
});

describe('installWebGLContextHandlers wiring', () => {
    function fakeCanvasRenderer() {
        const listeners = new Map<string, Array<(event?: unknown) => void>>();
        const element = {
            dataset: {} as Record<string, string>,
            addEventListener: (type: string, fn: (event?: unknown) => void) => {
                listeners.set(type, [...(listeners.get(type) ?? []), fn]);
            },
        };
        const renderer = {
            domElement: element,
            getContext: () => ({}), // truthy WebGL context stand-in
        };
        const fire = (type: string, event: unknown = { preventDefault: vi.fn() }) => {
            for (const fn of listeners.get(type) ?? []) fn(event);
            return event as { preventDefault: ReturnType<typeof vi.fn> };
        };
        return { renderer, element, listeners, fire };
    }

    it('routes contextlost/-restored into the recovery and preventDefaults', () => {
        const { renderer, fire } = fakeCanvasRenderer();
        const recovery = { onContextLost: vi.fn(), onContextRestored: vi.fn() };
        expect(installWebGLContextHandlers(renderer, silentLogger, { recovery })).toBe(true);
        const event = fire('webglcontextlost');
        expect(event.preventDefault).toHaveBeenCalled(); // keeps restore possible
        expect(recovery.onContextLost).toHaveBeenCalledTimes(1);
        fire('webglcontextrestored');
        expect(recovery.onContextRestored).toHaveBeenCalledTimes(1);
    });

    it('installs listeners once per canvas across repeated configure passes', () => {
        const { renderer, element, listeners } = fakeCanvasRenderer();
        const recovery = { onContextLost: vi.fn(), onContextRestored: vi.fn() };
        expect(installWebGLContextHandlers(renderer, silentLogger, { recovery })).toBe(true);
        expect(installWebGLContextHandlers(renderer, silentLogger, { recovery })).toBe(true);
        expect(element.dataset.sdsCtxRecovery).toBe('1');
        expect(listeners.get('webglcontextlost')).toHaveLength(1);
        expect(listeners.get('webglcontextrestored')).toHaveLength(1);
    });

    it('returns false when there is no GL context to guard', () => {
        expect(installWebGLContextHandlers({ getContext: () => null, domElement: {} }, silentLogger)).toBe(false);
        expect(installWebGLContextHandlers(null, silentLogger)).toBe(false);
    });
});
