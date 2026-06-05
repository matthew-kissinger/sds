// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Counting Sheep - shared mode identifiers (Cycle 59).
 *
 * The single source for the Counting Sheep id scheme, imported by BOTH the
 * client (entrance, GameState, round controller) and the Worker (leaderboard
 * submit + read), so the two can never drift on a mode string.
 *
 * Three related identifiers, kept distinct on purpose:
 *   - gameMode  'counting'             the top-level category (one
 *                                      MODE_CAPABILITIES row; the parallel of
 *                                      'solo' covering classic/extreme/...).
 *   - curve     'incremental' | 'exponential'
 *                                      the variant within counting; this is the
 *                                      singlePlayerMode handle and the entrance
 *                                      rung id.
 *   - leaderboard game_mode
 *               'counting-incremental' | 'counting-exponential'
 *                                      the DB game_mode + Worker GameMode + board
 *                                      key (= `counting-${curve}`).
 *
 * Pure constants + pure helpers. No imports, no DOM, no Three.js - safe under
 * the shared/ import discipline and trivially importable from worker/.
 */

/** The top-level gameMode both curves share (one MODE_CAPABILITIES row). */
export const COUNTING_GAME_MODE = 'counting';

/** The two curve variants, in entrance / ladder order. */
export const COUNTING_CURVES = Object.freeze(['incremental', 'exponential']);

/**
 * The scenes that offer Counting Sheep: the flat pasture (Home Field) and the
 * hero island (Rolling Hills). Open Country is excluded - it is a two-stage
 * gather-and-portal objective, a different category. This is the single source
 * for "does this scene have counting", read by both the leaderboard surface and
 * the entrance family selector so they cannot disagree.
 */
export const COUNTING_SCENE_IDS = Object.freeze(['field', 'rolling-hills']);

/**
 * Whether a scene offers Counting Sheep.
 * @param {unknown} sceneId
 * @returns {boolean}
 */
export function sceneOffersCounting(sceneId) {
    return typeof sceneId === 'string' && COUNTING_SCENE_IDS.includes(sceneId);
}

/**
 * The proven flock-capacity ceiling (the same count Chaos runs today) and the
 * hard cap on a counting run's cumulative. Past it no further batch is produced.
 */
export const COUNTING_HARD_CEILING = 5000;

/**
 * curve -> leaderboard game_mode string.
 * @param {string} curve
 * @returns {string}
 */
export function leaderboardModeForCurve(curve) {
    return `counting-${curve}`;
}

/** The two leaderboard game_mode strings, in curve order. */
export const COUNTING_LEADERBOARD_MODES = Object.freeze(
    COUNTING_CURVES.map(leaderboardModeForCurve),
);

/**
 * leaderboard game_mode -> curve, or undefined if not a counting board.
 * @param {unknown} mode
 * @returns {string | undefined}
 */
export function curveForLeaderboardMode(mode) {
    if (typeof mode !== 'string' || !mode.startsWith('counting-')) return undefined;
    const curve = mode.slice('counting-'.length);
    return COUNTING_CURVES.includes(curve) ? curve : undefined;
}

/**
 * Whether a leaderboard game_mode string is a Counting Sheep board.
 * @param {unknown} mode
 * @returns {boolean}
 */
export function isCountingLeaderboardMode(mode) {
    return curveForLeaderboardMode(mode) !== undefined;
}
