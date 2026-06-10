// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Achievement unlock toast - [P3-ACHIEVE-UI].
 *
 * Subscribes to the engine's onUnlock stream and surfaces each unlock as a
 * small self-dismissing toast in the warm-glass language (same family as
 * rendererFallbackNotice.js). Vanilla DOM on purpose: unlocks fire mid-game
 * from the completion/survival/competitive seams, outside any React HUD
 * mount, so the toast must not couple to the overlay lifecycle.
 *
 * Non-blocking by construction: `pointer-events: none` on the container and
 * every toast, `role="status"` + `aria-live="polite"` for screen readers,
 * auto-dismissal after TOAST_DURATION_MS. Multiple unlocks from one event
 * (e.g. `first-pen` + `pen-200-home-field` on the same completion) stack in
 * a flex column instead of overwriting each other.
 *
 * Installed once from App.js's initReactUI via a fire-and-forget dynamic
 * import, so this module rides the lazy achievements/UI chunk family and
 * never touches the main bundle. Strings resolve through the shared i18n
 * instance (lazy import, synchronous `t` once loaded).
 */

import { ACHIEVEMENTS } from './definitions.js';
import { onUnlock } from './engine.js';
import { enqueueToast } from '../ui/toastHub.js';

/** Toast lifetime before self-dismissal. */
export const TOAST_DURATION_MS = 6000;

/** Stable id for the stacking container (one per document).
 * Cycle 87 Phase 5: the bespoke container is gone (the shared top rail,
 * js/ui/overlayRail.js, generalized it); the id remains as the per-unlock
 * toast id prefix. */
export const TOAST_CONTAINER_ID = 'achievement-toasts';

let toastSeq = 0;

let installed = false;

/**
 * Subscribe the toast surface to achievement unlocks. Idempotent: a second
 * install while one is active is a no-op. Dependencies are injectable for
 * tests; production call sites pass nothing.
 *
 * @param {object} [deps]
 * @param {(cb: (id: string, unlockedAt: string) => void) => (() => void)} [deps.subscribe]
 * @param {(id: string) => void} [deps.show]
 * @returns {() => void} Uninstall (unsubscribes and clears the guard).
 */
export function installUnlockToast({ subscribe = onUnlock, show = showAchievementToastForId } = {}) {
    if (installed) return () => {};
    installed = true;
    let unsubscribe = null;
    try {
        unsubscribe = subscribe((id) => {
            try {
                show(id);
            } catch { /* a toast failure must never reach the unlock path */ }
        });
    } catch {
        installed = false;
        return () => {};
    }
    return () => {
        installed = false;
        try {
            unsubscribe?.();
        } catch { /* ignore */ }
    };
}

/**
 * Resolve the unlocked achievement's localized name + the "Achievement
 * unlocked" framing, then mount the toast. Unknown ids and DOM-free
 * environments are silent no-ops.
 *
 * @param {string} id Achievement id (see definitions.js).
 */
export function showAchievementToastForId(id) {
    if (typeof document === 'undefined') return;
    const def = ACHIEVEMENTS.find((d) => d.id === id);
    if (!def) return;
    import('../i18n.js')
        .then(({ default: i18n }) => {
            mountAchievementToast(i18n.t('achievements.ui.toastTitle'), i18n.t(def.nameKey));
        })
        .catch(() => {});
}

/**
 * Enqueue one toast with pre-resolved strings into the shared top rail.
 * Self-dismisses after `durationMs`; never intercepts input. Achievements
 * are the one legitimate in-game toast, so they do NOT suppress during
 * gameplay; multiple unlocks from one event queue and stack per the hub's
 * max-visible policy.
 *
 * @param {string} title Localized "Achievement unlocked" framing.
 * @param {string} name  Localized achievement name.
 * @param {object} [opts]
 * @param {number} [opts.durationMs]
 * @param {object} [opts.hubDeps] Injectable toastHub deps (tests).
 * @returns {{ dismiss: () => void } | null} Hub handle (null without a DOM).
 */
export function mountAchievementToast(title, name, { durationMs = TOAST_DURATION_MS, hubDeps = {} } = {}) {
    if (typeof document === 'undefined') return null;

    return enqueueToast({
        id: `${TOAST_CONTAINER_ID}-${toastSeq++}`,
        durationMs,
        suppressDuringGameplay: false,
        mount: (rowEl) => {
            const doc = rowEl.ownerDocument;
            const root = doc.createElement('div');
            root.setAttribute('role', 'status');
            root.setAttribute('aria-live', 'polite');
            Object.assign(root.style, {
                maxWidth: 'min(300px, calc(100vw - 32px))',
                padding: '8px 14px',
                borderRadius: '10px',
                background: 'color-mix(in srgb, var(--color-cream, #f6f1e7) 94%, transparent)',
                border: '1px solid var(--color-glass-warm-border, rgba(43,38,32,0.18))',
                boxShadow: '0 8px 22px rgba(43,38,32,0.22)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                color: 'var(--color-ink, #2b2620)',
                textAlign: 'center',
                pointerEvents: 'none',
            });

            const titleEl = doc.createElement('div');
            titleEl.textContent = title;
            Object.assign(titleEl.style, {
                fontSize: '10px',
                fontWeight: '600',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-ink-soft, rgba(43,38,32,0.72))',
                lineHeight: '1.3',
            });
            const nameEl = doc.createElement('div');
            nameEl.textContent = name;
            Object.assign(nameEl.style, {
                marginTop: '2px',
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fontWeight: '600',
                lineHeight: '1.25',
            });
            root.append(titleEl, nameEl);
            rowEl.appendChild(root);
        },
    }, hubDeps);
}
