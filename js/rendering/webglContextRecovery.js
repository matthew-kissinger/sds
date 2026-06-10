// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Z } from '../ui/zIndex.js';
/**
 * P4-CTX-RESTORE: graphics context-loss recovery.
 *
 * What a probe of the live WebGL path showed (dev server, WEBGL_lose_context
 * via Playwright): Three.js keeps the rAF loop alive through a lost context
 * (render() early-returns), and on `webglcontextrestored` it re-initializes
 * the GL state and re-uploads geometry/textures that still have CPU-side
 * images. What does NOT come back is anything baked once into a
 * WebGLRenderTarget at scene load - the far-tree billboard bakes in
 * TreePlacement (cached across scene swaps in `builder._bakeImpostorCache`)
 * keep referencing a framebuffer texture whose storage died with the old
 * context. And when the browser never fires `webglcontextrestored` at all
 * (real driver resets often don't), the player sits on a silently frozen
 * compositor frame forever.
 *
 * Decision: clean automatic reload rather than in-place re-bake. On
 * `webglcontextlost` we show a small overlay, then reload the page (URL
 * params preserved) as soon as the context restores - or after a short
 * timeout if it never does.
 * In-place recovery would need a re-bake registry threaded through
 * TreePlacement's impostor cache for a once-per-GPU-reset event; not worth
 * the surface area.
 *
 * The WebGPU path has the same gap one layer down: the production boot
 * preflights a throwaway device, but nothing watches the live renderer's
 * `device.lost` promise. `watchWebGpuDeviceLost` covers it with the same
 * overlay + reload (WebGPU has no restore event, so reload is immediate).
 *
 * The state machine is dependency-injected and pure-testable
 * (tests/ui/webglContextRecovery.spec.ts); production call sites pass
 * nothing. Telemetry: one `context_lost` event per loss with the outcome
 * (`reload-restored` | `reload-timeout` | `reload-device-lost`), sent with
 * `keepalive` so it survives the reload it precedes.
 */

/** How long to wait for `webglcontextrestored` before reloading anyway. */
export const CONTEXT_RESTORE_TIMEOUT_MS = 2000;

/** DOM id of the recovery overlay (probe + tests look it up). */
export const CONTEXT_LOST_OVERLAY_ID = 'context-lost-overlay';

function defaultReload() {
    // Plain reload keeps the full URL (scene/renderer/debug params) - the
    // same in-app restart the SW update path and the MP restartToMenu use.
    try { window.location.reload(); } catch { /* noop */ }
}

function defaultEmit(name, props) {
    import('../telemetry.js')
        .then(({ emitEvent }) => emitEvent(name, props))
        .catch(() => {});
}

/**
 * Pure state machine for one renderer's context-loss lifecycle. Fires the
 * overlay once, emits exactly one `context_lost` telemetry event, and calls
 * `reload` exactly once regardless of how many events race in.
 *
 * @param {object} [options]
 * @param {'webgl'|'webgpu'} [options.rendererKind]
 * @param {number} [options.timeoutMs]
 * @param {() => void} [options.showOverlay]
 * @param {() => void} [options.reload]
 * @param {(name: string, props: object) => void} [options.emit]
 * @param {(fn: () => void, ms: number) => any} [options.setTimer]
 * @param {(id: any) => void} [options.clearTimer]
 * @param {{ log?: Function, error?: Function }} [options.logger]
 */
export function createContextLossRecovery({
    rendererKind = 'webgl',
    timeoutMs = CONTEXT_RESTORE_TIMEOUT_MS,
    showOverlay = showContextLostOverlay,
    reload = defaultReload,
    emit = defaultEmit,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (id) => clearTimeout(id),
    logger = console,
} = {}) {
    let pending = false;
    let finalized = false;
    let timerId = null;

    const finalize = (outcome, extraProps = {}) => {
        if (finalized) return;
        finalized = true;
        if (timerId !== null) {
            try { clearTimer(timerId); } catch { /* noop */ }
            timerId = null;
        }
        try { emit('context_lost', { renderer: rendererKind, outcome, ...extraProps }); } catch { /* noop */ }
        try { reload(); } catch { /* noop */ }
    };

    return {
        /** `webglcontextlost`: overlay up, start the restore-or-reload clock. */
        onContextLost() {
            if (finalized || pending) return false;
            pending = true;
            logger.error?.(`[CTX] ${rendererKind} context lost - showing recovery overlay`);
            try { showOverlay(); } catch { /* noop */ }
            timerId = setTimer(() => finalize('reload-timeout'), timeoutMs);
            return true;
        },
        /** `webglcontextrestored`: reload now for a clean resource rebuild. */
        onContextRestored() {
            if (finalized || !pending) return false;
            logger.log?.(`[CTX] ${rendererKind} context restored - reloading for a clean rebuild`);
            finalize('reload-restored');
            return true;
        },
        /** WebGPU `device.lost`: no restore event exists, reload immediately. */
        onDeviceLost(reason = 'unknown') {
            if (finalized) return false;
            logger.error?.(`[CTX] ${rendererKind} device lost (${reason}) - reloading`);
            try { showOverlay(); } catch { /* noop */ }
            finalize('reload-device-lost', { reason: String(reason) });
            return true;
        },
        isPending: () => pending && !finalized,
        isFinalized: () => finalized,
    };
}

/**
 * Watch a Three.js WebGPURenderer's live GPUDevice for loss. The device only
 * exists after the renderer's async init, so poll the backend until it shows
 * up, then attach to `device.lost`. An intentional teardown resolves the
 * promise with reason 'destroyed' - that is not a loss, skip it.
 *
 * @param {object} renderer - Three.js WebGPURenderer (isWebGPURenderer true)
 * @param {object} [options]
 * @param {ReturnType<typeof createContextLossRecovery>} [options.recovery]
 * @param {number} [options.pollMs]
 * @param {number} [options.maxPolls]
 * @param {(fn: () => void, ms: number) => any} [options.setTimer]
 * @param {{ log?: Function, error?: Function }} [options.logger]
 * @returns {boolean} true if a watch was installed (false on double-install)
 */
export function watchWebGpuDeviceLost(renderer, {
    recovery = null,
    pollMs = 1000,
    maxPolls = 300,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    logger = console,
} = {}) {
    if (!renderer || renderer.__sdsDeviceLostWatchInstalled) return false;
    renderer.__sdsDeviceLostWatchInstalled = true;
    const rec = recovery ?? createContextLossRecovery({ rendererKind: 'webgpu', logger });

    let polls = 0;
    const attach = () => {
        const device = renderer.backend?.device ?? null;
        if (!device || typeof device.lost?.then !== 'function') {
            polls += 1;
            if (polls > maxPolls) return; // renderer never initialized; give up quietly
            setTimer(attach, pollMs);
            return;
        }
        device.lost
            .then((info) => {
                if (info?.reason === 'destroyed') return; // intentional dispose
                rec.onDeviceLost(info?.reason ?? 'unknown');
            })
            .catch(() => {});
    };
    attach();
    return true;
}

/**
 * Recovery overlay: a small warm-glass card (same family as the renderer
 * fallback toast) so the player sees "restarting" instead of a frozen or
 * gray frame for the second or two before the reload. Vanilla DOM - this
 * fires from renderer internals, independent of the React root. Strings ride
 * the shared i18n instance; the literal fallback only exists for the case
 * where the i18n module itself cannot load mid-context-loss.
 */
export function showContextLostOverlay() {
    if (typeof document === 'undefined') return;
    if (document.getElementById(CONTEXT_LOST_OVERLAY_ID)) return;
    import('../i18n.js')
        .then(({ default: i18n }) => {
            mountOverlay(i18n.t('contextLost.title'), i18n.t('contextLost.body'));
        })
        .catch(() => {
            mountOverlay('Graphics context lost', 'Restarting the renderer. The game will reload in a moment.');
        });
}

function mountOverlay(title, body) {
    if (document.getElementById(CONTEXT_LOST_OVERLAY_ID)) return;
    const root = document.createElement('div');
    root.id = CONTEXT_LOST_OVERLAY_ID;
    root.setAttribute('role', 'alert');
    root.setAttribute('aria-live', 'assertive');
    Object.assign(root.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: String(Z.critical),
        maxWidth: 'min(320px, calc(100vw - 32px))',
        padding: '14px 18px',
        borderRadius: '10px',
        background: 'color-mix(in srgb, var(--color-cream, #f6f1e7) 96%, transparent)',
        border: '1px solid var(--color-glass-warm-border, rgba(43,38,32,0.18))',
        boxShadow: '0 12px 32px rgba(43,38,32,0.3)',
        color: 'var(--color-ink, #2b2620)',
        textAlign: 'center',
        pointerEvents: 'none',
    });

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
        fontFamily: 'var(--font-display)',
        fontSize: '14px',
        fontWeight: '600',
        lineHeight: '1.3',
    });
    const bodyEl = document.createElement('div');
    bodyEl.textContent = body;
    Object.assign(bodyEl.style, {
        marginTop: '4px',
        fontSize: '12px',
        lineHeight: '1.4',
        color: 'var(--color-ink-soft, rgba(43,38,32,0.72))',
    });
    root.append(titleEl, bodyEl);
    document.body.appendChild(root);
}
