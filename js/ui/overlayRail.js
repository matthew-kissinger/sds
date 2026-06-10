// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Shared top-center overlay rail (Cycle 87 Phase 5).
 *
 * ONE fixed top-center flex column that every toast/notice mounts into, so
 * simultaneous notices stack with a gap instead of overlapping (the entrance
 * was observed showing the tutorial offer, the SW-update toast, and the
 * renderer-fallback notice at the same time, each at its own hardcoded
 * anchor). Generalizes the stacking container js/achievements/unlockToast.js
 * proved out.
 *
 * Top-center, not bottom: the bottom band is structurally contested on
 * mobile (joystick + sprint/bark + zoom + the HudLayout bottomSafe slot +
 * the tutorial pill). The rail leaves the bottom to gameplay surfaces.
 *
 * The rail itself is pointer-events: none; rows opt in for their own
 * content. `--sds-toast-top-offset` (published by HudLayout when the in-game
 * HUD is up, Phase 6) pushes the rail below the top-center HUD stack;
 * the 8px fallback is the entrance default.
 *
 * Vanilla DOM (no React) so boot-path callers stay chunk-light; React
 * callers portal into it.
 */

import { Z } from './zIndex.js';

/** Stable id for the rail element (one per document). */
export const TOP_RAIL_ID = 'sds-overlay-top-rail';

/**
 * Idempotent: returns the existing rail or creates it.
 *
 * @param {Document} [doc]
 * @returns {HTMLElement|null} null without a DOM.
 */
export function ensureTopRail(doc = (typeof document === 'undefined' ? null : document)) {
    if (!doc?.body) return null;
    let rail = doc.getElementById(TOP_RAIL_ID);
    if (rail) return rail;
    rail = doc.createElement('div');
    rail.id = TOP_RAIL_ID;
    Object.assign(rail.style, {
        position: 'fixed',
        top: 'calc(max(env(safe-area-inset-top, 8px), 8px) + var(--sds-toast-top-offset, 8px))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: String(Z.toast),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '92vw',
        pointerEvents: 'none',
    });
    doc.body.appendChild(rail);
    return rail;
}
