// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Deterministic PRNG primitives shared across client + Worker.
 *
 * Lifted from tests/sim-baseline/harness.js so that scene generators
 * (SceneObstacles, TreePlacement) can produce bit-identical output
 * across V8 instances (client browser, Cloudflare Workers, Node tests).
 *
 * Why this matters: Phase 3 lifts Poisson-disk tree placement into shared/,
 * and both client (visual mesh) and Worker (collision data) call it
 * independently. Raw Math.random() diverges between V8 instances.
 * mulberry32 with an explicit seed produces identical sequences anywhere.
 *
 * The constants are from the public-domain mulberry32 reference; do not change.
 */

/**
 * Returns a function that produces deterministic floats in [0, 1).
 * Same seed → same sequence.
 * @param {number} seed - 32-bit integer
 * @returns {() => number}
 */
export function mulberry32(seed) {
    let state = seed >>> 0;
    return function next() {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Monkey-patch Math.random with a seeded PRNG for the duration of fn().
 * Always restores, even on throw. Returns whatever fn() returned.
 *
 * Use this only when wrapping legacy Math.random-using code. Prefer
 * passing the rng function explicitly to new code.
 * @template T
 * @param {number} seed
 * @param {() => T} fn
 * @returns {T}
 */
export function withSeededRandom(seed, fn) {
    const rng = mulberry32(seed);
    const original = Math.random;
    Math.random = rng;
    try {
        return fn();
    } finally {
        Math.random = original;
    }
}
