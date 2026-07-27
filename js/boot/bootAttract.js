// @ts-check
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 46 Phase 3: the boot-time entrance gate.
 *
 * Decides whether the app paints the zen attract field as first frame (the
 * default for a plain open) or builds a scene directly. Any deep-link or
 * harness flag that needs a built scene opts out of attract:
 *
 *   - `?scene=<id>`     a shared scene deep-link wants that scene immediately.
 *   - `#/r/<code>`      a multiplayer room invite — the room locks the scene,
 *                       so it must build directly and keep the hard-reload swap
 *                       path (the attract crossfade never engages for MP).
 *
 * Sandbox deep-links stay on the attract scaffold until Start. Their config
 * already identifies the requested scene, and building a default scene while
 * the player is still editing the config only creates competing main-thread
 * work at the eventual Start click.
 *   - `?autostart=1`    the share-card / OG harness jumps straight into a game.
 *   - `?testNoCanvas=1` the headless test harness skips init() entirely.
 *   - cinematic mode    capture sessions pose a real scene, never the field.
 *
 * Pure and side-effect-free (no `location`, no `window`) so the entrance gate
 * is unit-testable without constructing the whole simulation. `main.js` passes
 * in `location.hash`, `location.search`, and the `isCinematicMode()` result.
 *
 * @param {object} [input]
 * @param {string} [input.hash]      `location.hash` (e.g. '#/r/ABCD', '#s/...').
 * @param {string} [input.search]    `location.search` (e.g. '?scene=field').
 * @param {boolean} [input.cinematic] `isCinematicMode()` result.
 * @returns {boolean} true → mount the zen attract field; false → build a scene.
 */
export function shouldBootAttract({ hash = '', search = '', cinematic = false } = {}) {
    const params = new URLSearchParams(search);
    const requestedScene = params.get('scene');
    const needsBuiltScene = hash.startsWith('#/r/');
    return (
        !requestedScene &&
        !needsBuiltScene &&
        params.get('autostart') !== '1' &&
        params.get('testNoCanvas') !== '1' &&
        !cinematic
    );
}
