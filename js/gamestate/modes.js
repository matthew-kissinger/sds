// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Mode dispatch tables — Cycle 29 Stream B1.
 *
 * Single edit-point for "what does mode X do." Replaces inline
 * `if (this.gameMode === 'competitive')` branches scattered across
 * GameState's getGate / getPasture / updateUI / updatePlayerScore /
 * getPlayerScore / submitScoreToLeaderboard.
 *
 * Adding a new gameMode is now a one-row table edit instead of four
 * call-site edits.
 *
 * Pure data + pure helpers. No side effects. The only import is the pure
 * shared difficulty ladder (no Three.js, no DOM), so `shared/` discipline holds.
 */

import { LEGACY_SOLO_LADDER } from '../../shared/difficulty.js';
import { COUNTING_GAME_MODE } from '../../shared/countingModes.js';

/**
 * Solo singlePlayerMode → totalSheep count.
 *
 * Cycle 58: this is now a back-compat re-export of the legacy default ladder
 * (`shared/difficulty.js`). Per-biome counts live on each scene's `soloLadder`
 * and resolve through `getSoloCount(scene, id)`; this flat table is the
 * fallback for callers without a scene (and for opt-out scenes). Single-sourced
 * from `LEGACY_SOLO_LADDER` so the two can never drift.
 *
 * @type {Readonly<Record<string, number>>}
 */
export const SOLO_MODE_SHEEP_COUNT = Object.freeze(
    Object.fromEntries(LEGACY_SOLO_LADDER.map((e) => [e.id, e.count])),
);

/**
 * Solo singlePlayerMode → leaderboard slug. Cycle 8 Phase 2b lookup
 * — replaces the prior `extreme ? 'soloExtreme' : 'soloClassic'` ternary
 * that silently dumped insane (3000) and chaos (5000) runs into the
 * soloClassic leaderboard. Practice has no leaderboard (gated separately
 * in submitScoreToLeaderboard).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const SOLO_MODE_TO_LEADERBOARD = Object.freeze({
    classic: 'soloClassic',
    extreme: 'soloExtreme',
    insane: 'soloInsane',
    chaos: 'soloChaos',
});

/**
 * Solo modes that opt into the spatial-hash extreme boid path.
 * Sandbox separately sets `useExtremeBoids` from its config.
 *
 * Cycle 58: legacy id-keyed set, retained for back-compat. The live gate is now
 * count-based (`isExtremeBoidCount`) because counts vary by biome (a 600-sheep
 * Open Country run wants the spatial-hash path; a 200-sheep run does not), so a
 * fixed id set no longer captures the intent.
 *
 * @type {ReadonlySet<string>}
 */
export const EXTREME_BOID_SOLO_MODES = Object.freeze(new Set(['extreme', 'insane', 'chaos']));

/**
 * Cycle 58: resolved-count threshold for the spatial-hash extreme-boid path.
 * 500 reproduces the pre-Cycle-58 Home Field behavior exactly — the legacy
 * extreme/insane/chaos counts (1000 / 3000 / 5000) clear it and classic (200) /
 * practice do not — while also routing the islands' new mid tiers (Open
 * Country 600) onto the spatial-hash path and keeping their small tiers off it.
 *
 * @type {number}
 */
export const EXTREME_BOID_COUNT_THRESHOLD = 500;

/**
 * Whether a resolved sheep count uses the spatial-hash extreme-boid path. This
 * is the live gate (decoupled from the difficulty id per Cycle 58 Q3).
 *
 * @param {number | undefined} count
 * @returns {boolean}
 */
export function isExtremeBoidCount(count) {
    return typeof count === 'number' && count >= EXTREME_BOID_COUNT_THRESHOLD;
}

/**
 * Cycle 58: count-based successor to the legacy `singlePlayerMode === 'extreme'
 * || 'insane'` gate that drives the large-flock difficulty tweaks (the extra
 * flee multiplier in OptimizedSheep, the ExtremeTuningPanel affordance). The
 * band [1000, 5000) reproduces the legacy set exactly for the existing ladders
 * (extreme 1000 and insane 3000 in; chaos 5000 and everything below 1000 out),
 * so behavior is unchanged for Home Field while staying count-driven for the
 * islands (a 600-sheep Open Country run is a smaller flock and stays normal).
 *
 * @param {number | undefined} count
 * @returns {boolean}
 */
export function isHighDifficultyCount(count) {
    return typeof count === 'number' && count >= 1000 && count < 5000;
}

/**
 * Legacy id-based gate, retained for back-compat with any caller that only has
 * the difficulty id (not the resolved count). Prefer `isExtremeBoidCount` where
 * the count is available.
 *
 * @param {string | undefined} singlePlayerMode
 * @returns {boolean}
 */
export function isExtremeBoidMode(singlePlayerMode) {
    return EXTREME_BOID_SOLO_MODES.has(singlePlayerMode);
}

/**
 * Capability descriptor for a top-level gameMode.
 *
 * @typedef {object} ModeCapabilities
 * @property {boolean} tracksPlayerScores  — playerScores[playerId] is read/written
 * @property {boolean} usesCompetitiveGates — getGate/getPasture return the array, not the single
 * @property {'cooperative' | 'competitive' | 'timed'} uiVariant — which updateXxxUI to dispatch
 * @property {boolean} submitsToLeaderboard — false for sandbox (practice gated separately by singlePlayerMode)
 * @property {boolean} [roundBased] - true for round-based modes (Counting Sheep); the run spawns growing batches
 * @property {boolean} [autoCompletes] - defaults true; false for player-ended modes (Counting Sheep banks manually)
 */

/**
 * @type {Readonly<Record<string, ModeCapabilities>>}
 */
export const MODE_CAPABILITIES = Object.freeze({
    solo: Object.freeze({
        tracksPlayerScores: false,
        usesCompetitiveGates: false,
        uiVariant: 'cooperative',
        submitsToLeaderboard: true,
    }),
    multiplayer: Object.freeze({
        tracksPlayerScores: false,
        usesCompetitiveGates: false,
        uiVariant: 'cooperative',
        submitsToLeaderboard: true,
    }),
    competitive: Object.freeze({
        tracksPlayerScores: true,
        usesCompetitiveGates: true,
        uiVariant: 'competitive',
        submitsToLeaderboard: true,
    }),
    timed: Object.freeze({
        // Timed shares cooperative gates (one shared gate for all players)
        // but tracks per-player scores and runs the timed UI variant.
        tracksPlayerScores: true,
        usesCompetitiveGates: false,
        uiVariant: 'timed',
        submitsToLeaderboard: true,
    }),
    sandbox: Object.freeze({
        tracksPlayerScores: false,
        usesCompetitiveGates: false,
        uiVariant: 'cooperative',
        submitsToLeaderboard: false,
    }),
    // Counting Sheep (Cycle 59): single-player, cooperative-style UI, but
    // round-based and player-ended - the run spawns growing batches and never
    // auto-completes; the player banks the counted total. Both curves
    // (incremental / exponential) share this one gameMode row.
    [COUNTING_GAME_MODE]: Object.freeze({
        tracksPlayerScores: false,
        usesCompetitiveGates: false,
        uiVariant: 'cooperative',
        submitsToLeaderboard: true,
        roundBased: true,
        autoCompletes: false,
    }),
});

const DEFAULT_CAPABILITIES = MODE_CAPABILITIES.solo;

/**
 * Lookup with safe fallback. Unknown gameModes get the solo defaults
 * (single-gate, cooperative UI, leaderboard-eligible) — defensive against
 * a stray string from an old save or a bad room state.
 *
 * @param {string | undefined} gameMode
 * @returns {ModeCapabilities}
 */
export function getModeCapabilities(gameMode) {
    return MODE_CAPABILITIES[gameMode] || DEFAULT_CAPABILITIES;
}
