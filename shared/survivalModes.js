// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Survival - shared leaderboard-mode identifiers (Cycle 66 P6).
 *
 * The single source for the Newsheepdogland survival board key, imported by BOTH
 * the client (the run-summary submit + the leaderboard view) and the Worker
 * (score submit allow-list + read), so the two can never drift on the mode
 * string. Mirrors shared/countingModes.js.
 *
 * Survival is a live-read board partitioned by (game_mode='survival', scene_id),
 * ranked by peak flock size DESC (higher is better). Like counting/daily it has
 * NO materialized players-row column - getLeaderboard reads it straight from
 * score_submissions. sheep_count is not part of its identity (the score IS the
 * flock size, so any submitted count is simply unused for these rows).
 *
 * Pure constants + helpers. No imports, no DOM, no Three.js - safe under the
 * shared/ import discipline and trivially importable from worker/.
 */

/** The survival leaderboard game_mode string (DB game_mode + Worker GameMode + board key). */
export const SURVIVAL_LEADERBOARD_MODE = 'survival';

/**
 * The scenes that run a survival mode. Newsheepdogland is the only one this
 * cycle; the list is the single source so the board surface and the entrance
 * cannot disagree.
 */
export const SURVIVAL_SCENE_IDS = Object.freeze(['newsheepdogland']);

/**
 * A generous absolute upper bound on a survival score (peak flock size). The
 * real ceiling is the scene's `maxFlock`, but the board bound stays loose so a
 * future feel-pass retune of maxFlock needs no Worker change. The score is a
 * non-negative integer (a sheep tally).
 */
export const SURVIVAL_MAX_SCORE = 100000;

/**
 * Whether a leaderboard game_mode string is the survival board.
 * @param {unknown} mode
 * @returns {boolean}
 */
export function isSurvivalLeaderboardMode(mode) {
    return mode === SURVIVAL_LEADERBOARD_MODE;
}

/**
 * Whether a scene offers survival.
 * @param {unknown} sceneId
 * @returns {boolean}
 */
export function sceneOffersSurvival(sceneId) {
    return typeof sceneId === 'string' && SURVIVAL_SCENE_IDS.includes(sceneId);
}
