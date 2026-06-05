// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Counting Sheep - round controller + curves (Cycle 59).
 *
 * Client-only: solo runs entirely on the client (the Worker DO authority is
 * multiplayer-only), so this is NOT a shared/ deterministic module. The two
 * pure curve functions and the round-state helpers live here; the shared id
 * scheme (gameMode / curve / leaderboard-mode strings + the 5000 ceiling) lives
 * in shared/countingModes.js.
 *
 * The loop: round n spawns a batch of `rawBatchSize(curve, n)` sheep; when the
 * whole active flock is penned the next round spawns. Cumulative is clamped to
 * COUNTING_HARD_CEILING - past that no further batch is produced and the run
 * continues until the player banks.
 */

import { COUNTING_CURVES, COUNTING_HARD_CEILING } from '../../shared/countingModes.js';

/**
 * Incremental curve: round n spawns n sheep (1, 2, 3, 4, ...). The meditative
 * endurance climb. Cumulative after round n is the triangular number n(n+1)/2,
 * so the cap (5000) lands near round 99.
 *
 * @param {number} round 1-based round number
 * @returns {number}
 */
export function incrementalBatch(round) {
    return round < 1 ? 0 : Math.floor(round);
}

/**
 * Exponential curve: round n spawns 2^(n-1) sheep (1, 2, 4, 8, 16, ...). The
 * intense sprint. Cumulative after round n is 2^n - 1; round 13 is 4096, the
 * practical human ceiling.
 *
 * @param {number} round 1-based round number
 * @returns {number}
 */
export function exponentialBatch(round) {
    return round < 1 ? 0 : 2 ** (Math.floor(round) - 1);
}

const CURVE_FNS = Object.freeze({
    incremental: incrementalBatch,
    exponential: exponentialBatch,
});

/**
 * The raw (unclamped) batch size a curve produces for a round.
 *
 * @param {'incremental' | 'exponential'} curve
 * @param {number} round 1-based
 * @returns {number}
 */
export function rawBatchSize(curve, round) {
    const fn = CURVE_FNS[curve];
    if (!fn) throw new Error(`countingMode: unknown curve "${curve}"`);
    return fn(round);
}

/**
 * The batch size for a round given the cumulative already spawned, clamped so
 * cumulative never exceeds COUNTING_HARD_CEILING. Returns 0 once the ceiling is
 * reached (no further batch).
 *
 * @param {'incremental' | 'exponential'} curve
 * @param {number} round 1-based
 * @param {number} cumulative sheep already spawned across prior rounds
 * @returns {number}
 */
export function clampedBatchSize(curve, round, cumulative) {
    const remaining = COUNTING_HARD_CEILING - cumulative;
    if (remaining <= 0) return 0;
    return Math.min(rawBatchSize(curve, round), remaining);
}

/**
 * @typedef {object} CountingRoundState
 * @property {'incremental' | 'exponential'} curve
 * @property {number} round       the current round (0 before the first batch)
 * @property {number} cumulative  total sheep spawned so far across all rounds
 * @property {boolean} done        true once the cumulative ceiling is reached
 */

/**
 * A fresh round-state object for a counting run on a given curve. The first
 * `advanceRound` call produces round 1's batch.
 *
 * @param {'incremental' | 'exponential'} curve
 * @returns {CountingRoundState}
 */
export function createRoundState(curve) {
    if (!COUNTING_CURVES.includes(curve)) {
        throw new Error(`countingMode: unknown curve "${curve}"`);
    }
    return { curve, round: 0, cumulative: 0, done: false };
}

/**
 * Advance to the next round: compute the next clamped batch, fold it into the
 * cumulative, and return the batch to activate. Mutates `state` in place. A
 * return of 0 means the ceiling is reached (`state.done` becomes true) and no
 * batch spawns.
 *
 * @param {CountingRoundState} state
 * @returns {number} the batch size to activate this round (0 when done)
 */
export function advanceRound(state) {
    if (state.done) return 0;
    const nextRound = state.round + 1;
    const batch = clampedBatchSize(state.curve, nextRound, state.cumulative);
    if (batch <= 0) {
        state.done = true;
        return 0;
    }
    state.round = nextRound;
    state.cumulative += batch;
    if (state.cumulative >= COUNTING_HARD_CEILING) state.done = true;
    return batch;
}
