// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Service-worker update toast - [P4-SW-TOAST].
 *
 * sw.js calls skipWaiting() on install and clients.claim() on activate, so
 * when a new deploy lands the fresh worker takes control of open pages
 * mid-session and `controllerchange` fires on navigator.serviceWorker.
 * The page's in-memory bundle is still the old build at that point; only a
 * reload picks up the new shell.
 *
 * This module listens for that takeover and shows a small persistent
 * (not self-dismissing) warm-glass toast: "A new version is ready." plus a
 * Refresh button that calls location.reload(). Nothing auto-reloads; the
 * player chooses when. (The previous index.html behavior reloaded as soon
 * as the tab went hidden, which could still yank an active run when the
 * player tabbed away mid-game.)
 *
 * Initial-claim guard: `controllerchange` ALSO fires when the very first
 * service worker claims a previously uncontrolled page (clients.claim() on
 * first install). That is not an update, so the toast only shows when the
 * page already had a controller before the change.
 *
 * Vanilla DOM on purpose (same family as rendering/rendererFallbackNotice.js
 * and achievements/unlockToast.js): it must work on the entrance and
 * mid-game, independent of the lazy React overlay. Installed from main.js
 * via a fire-and-forget dynamic import, so it rides its own tiny chunk.
 * Strings resolve through the shared i18n instance (lazy import).
 *
 * Cycle 87 Phase 5: placement and lifecycle moved to the shared top rail via
 * js/ui/toastHub.js. The toast is persistent (durationMs 0) and suppressed
 * during gameplay - it used to sit bottom-center OVER the play field for the
 * whole run; now it waits in the queue and shows when the run ends.
 */

import { enqueueToast } from '../ui/toastHub.js';

/** Stable id for the toast root (one per document; dedupes re-shows). */
export const SW_UPDATE_TOAST_ID = 'sw-update-toast';

let installed = false;

/**
 * Subscribe to `controllerchange` on the service-worker container and show
 * the update toast when a NEW worker takes over an already-controlled page.
 * Idempotent: a second install while one is active is a no-op. Dependencies
 * are injectable for tests; production call sites pass nothing.
 *
 * @param {object} [deps]
 * @param {{ controller: object|null,
 *           addEventListener: Function,
 *           removeEventListener: Function }|null} [deps.container]
 *   navigator.serviceWorker (or a test double).
 * @param {() => void} [deps.show] Toast surface.
 * @returns {() => void} Uninstall (removes the listener, clears the guard).
 */
export function installSwUpdateToast({
    container = (typeof navigator !== 'undefined' ? navigator.serviceWorker : null) ?? null,
    show = showSwUpdateToast,
} = {}) {
    if (installed) return () => {};
    if (!container || typeof container.addEventListener !== 'function') return () => {};
    installed = true;

    // Snapshot at install time: was the page already controlled? If not, the
    // first controllerchange is the initial claim, not an update.
    let hadController = !!container.controller;
    let shown = false;

    const onControllerChange = () => {
        if (!hadController) {
            hadController = true;
            return;
        }
        if (shown) return;
        shown = true;
        try {
            show();
        } catch { /* a toast failure must never break the page */ }
    };

    container.addEventListener('controllerchange', onControllerChange);
    return () => {
        installed = false;
        try {
            container.removeEventListener('controllerchange', onControllerChange);
        } catch { /* ignore */ }
    };
}

/**
 * Default surface: resolve the localized strings, then mount the toast.
 * DOM-free environments are silent no-ops.
 */
export function showSwUpdateToast() {
    if (typeof document === 'undefined') return;
    import('../i18n.js')
        .then(({ default: i18n }) => {
            mountSwUpdateToast(i18n.t('swUpdate.ready'), i18n.t('common.refresh'));
        })
        .catch(() => {});
}

/**
 * Enqueue the persistent toast with pre-resolved strings into the shared top
 * rail (warm-glass language; never self-dismisses - the deploy stays ready
 * until the player refreshes). Suppressed during gameplay: queued while a
 * run is active, shown when it ends. Only the toast itself accepts pointer
 * events. `role="status"` keeps it polite for screen readers.
 *
 * @param {string} body Localized "A new version is ready." framing.
 * @param {string} buttonLabel Localized "Refresh".
 * @param {object} [opts]
 * @param {() => void} [opts.reload] Reload trigger (injectable for tests).
 * @param {object} [opts.hubDeps] Injectable toastHub deps (tests).
 * @returns {{ dismiss: () => void } | null} Hub handle (null without a DOM).
 */
export function mountSwUpdateToast(body, buttonLabel, {
    reload = () => window.location.reload(),
    hubDeps = {},
} = {}) {
    if (typeof document === 'undefined' || !document.body) return null;

    return enqueueToast({
        id: SW_UPDATE_TOAST_ID,
        durationMs: 0,
        suppressDuringGameplay: true,
        mount: (rowEl) => {
            const doc = rowEl.ownerDocument;
            const root = doc.createElement('div');
            root.id = SW_UPDATE_TOAST_ID;
            root.setAttribute('role', 'status');
            root.setAttribute('aria-live', 'polite');
            Object.assign(root.style, {
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                maxWidth: 'min(320px, calc(100vw - 32px))',
                padding: '8px 10px 8px 14px',
                borderRadius: '10px',
                background: 'color-mix(in srgb, var(--color-cream, #f6f1e7) 94%, transparent)',
                border: '1px solid var(--color-glass-warm-border, rgba(43,38,32,0.18))',
                boxShadow: '0 8px 22px rgba(43,38,32,0.22)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: 'var(--color-ink, #2b2620)',
                pointerEvents: 'auto',
            });

            const bodyEl = doc.createElement('div');
            bodyEl.textContent = body;
            Object.assign(bodyEl.style, {
                fontFamily: 'var(--font-display)',
                fontSize: '12px',
                fontWeight: '600',
                lineHeight: '1.3',
            });

            const button = doc.createElement('button');
            button.type = 'button';
            button.textContent = buttonLabel;
            Object.assign(button.style, {
                flexShrink: '0',
                padding: '5px 12px',
                borderRadius: '7px',
                border: '1px solid var(--color-glass-warm-border, rgba(43,38,32,0.22))',
                background: 'var(--color-ink, #2b2620)',
                color: 'var(--color-cream, #f6f1e7)',
                fontFamily: 'var(--font-display)',
                fontSize: '11px',
                fontWeight: '600',
                lineHeight: '1.2',
                minHeight: '32px',
                cursor: 'pointer',
            });
            button.addEventListener('click', () => {
                try {
                    reload();
                } catch { /* ignore */ }
            });

            root.append(bodyEl, button);
            rowEl.appendChild(root);
        },
    }, hubDeps);
}
