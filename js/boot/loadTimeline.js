// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Boot timeline (Cycle 112 Phase 5).
 *
 * "Loading is slow" was a real complaint with no number behind it, so it could
 * not be closed or regressed against. This records the two moments a player
 * actually waits through:
 *
 *   firstInteractive - the entrance is on screen and Play can be pressed.
 *   roundPlayable    - the round is built and the player has control.
 *
 * Times are `performance.now()`, which is measured from `timeOrigin`, so on a
 * cold navigation they read as milliseconds since the page started loading.
 * That is the number D17's budget (2,500ms desktop, 5,000ms phone) refers to.
 *
 * Marks are idempotent: the first call for a name wins. A scene swap mid-session
 * would otherwise overwrite `roundPlayable` with a much later time and quietly
 * turn a cold-load measurement into a warm one.
 *
 * Read by tools/validation/cold-load.mjs off `window.__sdsBootTimeline`. Kept
 * deliberately tiny and dependency-free: it sits on the boot path.
 */

const marks = Object.create(null);

/**
 * Record a boot milestone the first time it happens.
 * @param {string} name
 * @returns {number|null} the recorded time, or null outside the browser
 */
export function markBoot(name) {
    if (typeof performance === 'undefined') return null;
    if (marks[name] !== undefined) return marks[name];
    marks[name] = performance.now();
    if (typeof window !== 'undefined') {
        window.__sdsBootTimeline = marks;
    }
    return marks[name];
}

/** A copy of every mark recorded so far. */
export function getBootTimeline() {
    return { ...marks };
}

/** Test-only: forget every mark. */
export function resetBootTimeline() {
    for (const k of Object.keys(marks)) delete marks[k];
}
