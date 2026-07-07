// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 60 Phase 2 - pure menu-navigation helpers.
 *
 * Kept DOM-free so the traversal logic is unit-testable without jsdom. The
 * React hook (useMenuNavigation) and the gamepad poll (menuGamepad) build on
 * these.
 */

/**
 * Wrap an index by `dir` (-1 prev / +1 next) over `count` items.
 * A negative `current` (nothing focused yet) seeds to the first item when
 * moving forward, or the last when moving back. A valid preferred index wins
 * that first seed so a menu can land on its primary action.
 * @param {number} current
 * @param {number} count
 * @param {number} dir
 * @param {number} [preferredIndex]
 * @returns {number} the new index, or -1 when there is nothing to focus.
 */
export function stepIndex(current, count, dir, preferredIndex = -1) {
    if (count <= 0) return -1;
    if (current < 0) {
        if (preferredIndex >= 0 && preferredIndex < count) return preferredIndex;
        return dir > 0 ? 0 : count - 1;
    }
    return (current + dir + count) % count;
}

/**
 * Map a nav event type to an intent. Up/Left move -1; Down/Right move +1;
 * activate / back pass through.
 * @param {string} type
 * @returns {{ move?: number, activate?: boolean, back?: boolean }}
 */
export function navAction(type) {
    if (type === 'up' || type === 'left') return { move: -1 };
    if (type === 'down' || type === 'right') return { move: 1 };
    if (type === 'activate') return { activate: true };
    if (type === 'back') return { back: true };
    return {};
}
