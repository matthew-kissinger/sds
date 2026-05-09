/**
 * Win-condition resolver — Cycle 29 Stream B3.
 *
 * Pure predicates that read a GameState-shaped object and return whether
 * its win condition is met. Extracted from GameState's checkCompletion /
 * checkSandboxCompletion / checkCompetitiveCompletion methods.
 *
 * Competitive completion delegates to the existing pure implementation
 * in shared/GameStateValidation.js — `shared/` is consumed by reference,
 * not modified, so the deterministic-sim contract stays intact (the
 * shared function is what the Worker DO already uses authoritatively).
 *
 * GameState's method wrappers handle the side effect of mutating
 * gameCompleted on a successful solo/sandbox-fallthrough completion.
 * That mutation is single-shot ("don't re-trigger completion flow once
 * triggered") and stays in the orchestrator so the predicate functions
 * here remain pure and harness-friendly.
 */

import { checkCompetitiveCompletion as sharedCheckCompetitiveCompletion } from '../../shared/GameStateValidation.js';

/**
 * @typedef {object} GameStateLike
 * @property {string} gameMode
 * @property {number} sheepRetired
 * @property {{length: number} | unknown[]} sheep
 * @property {number} totalSheep
 * @property {{winCondition: string, winPercentage?: number} | null | undefined} sandboxRules
 * @property {Record<string, number>} playerScores
 * @property {Array<unknown>} competitiveGates
 */

/**
 * Solo / multiplayer / timed completion: every spawned sheep retired.
 *
 * The predicate compares against `state.sheep.length` (not totalSheep)
 * because the array is the source of truth at runtime — it accounts
 * for partial spawns or mid-game count adjustments.
 *
 * @param {GameStateLike} state
 * @returns {boolean}
 */
export function isSoloComplete(state) {
    return state.sheepRetired >= state.sheep.length;
}

/**
 * Sandbox completion driven by `sandboxRules.winCondition`. Falls
 * through to `isSoloComplete` when no rules are present or gameMode
 * isn't 'sandbox', mirroring the existing checkSandboxCompletion
 * fallthrough contract.
 *
 * @param {GameStateLike} state
 * @returns {boolean}
 */
export function isSandboxComplete(state) {
    if (!state.sandboxRules || state.gameMode !== 'sandbox') {
        return isSoloComplete(state);
    }
    const rules = state.sandboxRules;

    if (rules.winCondition === 'none') return false;
    if (rules.winCondition === 'all') return state.sheepRetired >= state.totalSheep;
    if (rules.winCondition === 'percentage') {
        const target = Math.ceil(state.totalSheep * (rules.winPercentage / 100));
        return state.sheepRetired >= target;
    }
    return false;
}

/**
 * Competitive completion shape: { isComplete, winner, winType, finalScores? }.
 * Delegates to shared/GameStateValidation.checkCompetitiveCompletion (the
 * Worker DO uses the same pure function authoritatively). Defends the
 * wrong-gameMode case the GameState method was responsible for.
 *
 * @param {GameStateLike} state
 * @returns {{isComplete: boolean, winner: string | null, winType: string | null, finalScores?: Record<string, number>}}
 */
export function resolveCompetitiveCompletion(state) {
    if (state.gameMode !== 'competitive') {
        return { isComplete: false, winner: null, winType: null };
    }
    const playerCount = Object.keys(state.playerScores).length;
    return sharedCheckCompetitiveCompletion(state.playerScores, playerCount, state.totalSheep);
}
