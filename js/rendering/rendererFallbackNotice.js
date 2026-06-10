// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * P1-MOBILE-FALLBACK: surface the WebGPU -> WebGL fallback.
 *
 * When a load lands on the WebGL renderer because the platform could not
 * deliver WebGPU, show a non-blocking "compatibility rendering" toast once
 * per session and emit a `renderer_fallback` telemetry event. Involuntary
 * means `window.__sdsRendererMode.fallbackReason` is set (index.html boot
 * shim or the main.js production-boot catch) or the load carried an explicit
 * `?fallbackReason=` in the URL. Known reasons today: webgpu-unavailable,
 * webgpu-adapter-unavailable, webgpu-device-unavailable,
 * webgpu-device-request-failed, production-webgpu-boot-failed. Frame-budget
 * misses no longer demote the renderer (Cycle 87 Phase 1), so
 * webgpu-frame-budget is a legacy reason that can only arrive via URL.
 *
 * A voluntary WebGL run stays silent: an explicit `?renderer=webgl` or the
 * experimentalWebGpu setting turned off produces no fallbackReason, so the
 * decision below never fires for it.
 *
 * The decision is a pure function so the gating is unit-testable
 * (tests/ui/rendererFallbackNotice.spec.ts); the orchestrator wires it to
 * window/sessionStorage/i18n/telemetry with every dependency injectable.
 */

/** sessionStorage guard: one notice per session across scene swaps/reboots. */
export const RENDERER_FALLBACK_NOTICE_KEY = 'sds:rendererFallbackNoticed';

/** Toast lifetime before self-dismissal. */
export const TOAST_DURATION_MS = 3000;

const NO_NOTICE = Object.freeze({ notify: false, reason: null });

/**
 * Pure decision: should this load surface the compatibility-rendering notice?
 *
 * @param {object} [input]
 * @param {{ effective?: string, fallbackReason?: string|null }|null} [input.rendererMode]
 *   the `window.__sdsRendererMode` record as resolved at boot.
 * @param {string|null} [input.urlFallbackReason] explicit `?fallbackReason=`
 *   carried in the URL (paired with `?renderer=webgl`, which zeroes
 *   rendererMode.fallbackReason on that load).
 * @param {boolean} [input.alreadyNoticed] sessionStorage guard already set.
 * @returns {{ notify: boolean, reason: string|null }}
 */
export function decideRendererFallbackNotice({
    rendererMode = null,
    urlFallbackReason = null,
    alreadyNoticed = false,
} = {}) {
    if (alreadyNoticed) return NO_NOTICE;
    if (!rendererMode || rendererMode.effective !== 'webgl') return NO_NOTICE;
    const reason = rendererMode.fallbackReason || urlFallbackReason || null;
    if (!reason) return NO_NOTICE;
    return { notify: true, reason: String(reason) };
}

function defaultSessionStorage() {
    try {
        return typeof window !== 'undefined' ? window.sessionStorage : null;
    } catch {
        return null; // some privacy modes throw on the accessor itself
    }
}

function defaultEmit(name, props) {
    import('../telemetry.js')
        .then(({ emitEvent }) => emitEvent(name, props))
        .catch(() => {});
}

/**
 * Orchestrator: read the session guard, decide, then (at most once per
 * session) set the guard, show the toast, and emit `renderer_fallback`
 * with { reason, requested, webgpuApiAvailable } (build/ua context is
 * covered server-side on /api/event).
 *
 * Every dependency is injectable for tests; production call sites pass
 * nothing.
 *
 * @returns {{ notify: boolean, reason: string|null }} the decision taken.
 */
export function maybeNotifyRendererFallback({
    rendererMode = (typeof window !== 'undefined' ? window.__sdsRendererMode : null) ?? null,
    search = typeof location !== 'undefined' ? location.search : '',
    storage = defaultSessionStorage(),
    showNotice = showRendererFallbackToast,
    emit = defaultEmit,
} = {}) {
    let alreadyNoticed = false;
    try {
        alreadyNoticed = storage?.getItem(RENDERER_FALLBACK_NOTICE_KEY) === '1';
    } catch {}
    let urlFallbackReason = null;
    try {
        urlFallbackReason = new URLSearchParams(search).get('fallbackReason');
    } catch {}
    const decision = decideRendererFallbackNotice({ rendererMode, urlFallbackReason, alreadyNoticed });
    if (!decision.notify) return decision;
    try {
        storage?.setItem(RENDERER_FALLBACK_NOTICE_KEY, '1');
    } catch {}
    try {
        showNotice(decision.reason);
    } catch {}
    try {
        emit('renderer_fallback', {
            reason: decision.reason,
            requested: rendererMode?.requested ?? '',
            webgpuApiAvailable: rendererMode?.webgpuApiAvailable === true,
        });
    } catch {}
    return decision;
}

/**
 * Default notice surface: a small self-dismissing toast in the warm-glass
 * entrance language (cream glass, ink text - same family as
 * MobilePerfWarning.tsx). Vanilla DOM on purpose: it fires from the main.js
 * boot path before/independent of the lazy React overlay, and App.js is the
 * React mount owner. `pointer-events: none` keeps it strictly non-blocking;
 * `role="status"` keeps it polite for screen readers. The toast is intentionally
 * entrance-only so renderer diagnostics never compete with active play.
 * Strings ride the shared i18n instance (bundled resources, synchronous `t`
 * after import).
 */
export function showRendererFallbackToast() {
    if (typeof document === 'undefined') return;
    import('../i18n.js')
        .then(({ default: i18n }) => {
            mountToast(i18n.t('rendererFallback.title'), i18n.t('rendererFallback.body'));
        })
        .catch(() => {});
}

function mountToast(title, body) {
    if (window.__sds?.gameInstanceRef?.gameState?.gameActive === true) return;

    const root = document.createElement('div');
    root.id = 'renderer-fallback-toast';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    Object.assign(root.style, {
        position: 'fixed',
        top: 'calc(16px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '18',
        maxWidth: 'min(280px, calc(100vw - 32px))',
        padding: '8px 10px',
        borderRadius: '8px',
        background: 'color-mix(in srgb, var(--color-cream, #f6f1e7) 94%, transparent)',
        border: '1px solid var(--color-glass-warm-border, rgba(43,38,32,0.18))',
        boxShadow: '0 8px 22px rgba(43,38,32,0.22)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'var(--color-ink, #2b2620)',
        textAlign: 'left',
        pointerEvents: 'none',
        opacity: '0',
        transition: 'opacity 220ms var(--ease-pastoral, ease-out)',
    });

    const titleEl = document.createElement('div');
    titleEl.textContent = title;
    Object.assign(titleEl.style, {
        fontFamily: 'var(--font-display)',
        fontSize: '12px',
        fontWeight: '600',
        lineHeight: '1.25',
    });
    const bodyEl = document.createElement('div');
    bodyEl.textContent = body;
    Object.assign(bodyEl.style, {
        marginTop: '2px',
        fontSize: '11px',
        lineHeight: '1.3',
        color: 'var(--color-ink-soft, rgba(43,38,32,0.72))',
    });
    root.append(titleEl, bodyEl);
    document.body.appendChild(root);

    let removed = false;
    let activePlayTimer = null;
    let autoDismissTimer = null;
    const dismiss = () => {
        if (removed) return;
        removed = true;
        if (activePlayTimer) clearInterval(activePlayTimer);
        if (autoDismissTimer) clearTimeout(autoDismissTimer);
        root.style.opacity = '0';
        setTimeout(() => root.remove(), 300);
    };
    activePlayTimer = setInterval(() => {
        if (window.__sds?.gameInstanceRef?.gameState?.gameActive === true) dismiss();
    }, 250);
    autoDismissTimer = setTimeout(dismiss, TOAST_DURATION_MS);

    requestAnimationFrame(() => { root.style.opacity = '1'; });
}
