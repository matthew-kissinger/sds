// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Multi-stage objective state machine — Cycle 29 Stream B4 (extracted
 * from GameState), Cycle 34 Phase 2 (promoted from `js/gamestate/` to
 * `shared/` so the Worker authoritative sim runs the same byte-identical
 * state transitions the client predictor runs).
 *
 * Encapsulates the Cycle 7 Phase 3 round-up → drive transition:
 *
 *   `roundup` — sheep must be inside the round-up zone disc; once enough
 *               are inside for `holdRequired` seconds, stage flips.
 *   `drive`   — corral retirement is unlocked; sheep entering the
 *               corral disc retire and earn the player a sheep.
 *
 * Pure functions over a plain `{stage, roundupZone, requiredSheep,
 * holdRequired, sheepInZone, holdTimer}` state object. Mutates the
 * state in place where called from GameState's per-frame tick (matches
 * the original behavior; allocating a new object every tick would be
 * wasteful).
 *
 * `requiredSheep` resolution delegates to shared/ObjectiveLogic so
 * fractional + min math stays in one place (the Worker's per-mode count
 * scaling reads the same function).
 */

import { getRequiredSheep } from './ObjectiveLogic.js';

/**
 * @typedef {import('./scenes/types.js').ObjectiveDef} ObjectiveDef
 */

/**
 * @typedef {object} ObjectiveState
 * @property {'roundup' | 'drive'} stage
 * @property {{x: number, z: number, radius: number}} roundupZone
 * @property {number} requiredSheep
 * @property {number} holdRequired
 * @property {number} sheepInZone
 * @property {number} holdTimer
 */

/**
 * Build a fresh objective state from a scene def. Initial stage is
 * always 'roundup'; the tick advances to 'drive' when the hold is met.
 * `requiredSheep` resolves against `totalSheep` via shared/ObjectiveLogic
 * (fractional + min); subsequent calls to `refreshObjective` recompute
 * after a per-mode totalSheep change.
 *
 * @param {ObjectiveDef | null | undefined} def
 * @param {number} totalSheep
 * @returns {ObjectiveState | null}
 */
export function createObjective(def, totalSheep) {
    if (!def) return null;
    return {
        stage: 'roundup',
        roundupZone: { x: def.roundupZone.x, z: def.roundupZone.z, radius: def.roundupZone.radius },
        requiredSheep: getRequiredSheep(def, totalSheep),
        holdRequired: def.holdRequired,
        sheepInZone: 0,
        holdTimer: 0,
    };
}

/**
 * Recompute requiredSheep against the current totalSheep (called after
 * startGame sets the per-mode sheep count). No-op when there's no
 * objective or no def.
 *
 * @param {ObjectiveState | null} objective
 * @param {ObjectiveDef | null | undefined} def
 * @param {number} totalSheep
 * @returns {void}
 */
export function refreshObjective(objective, def, totalSheep) {
    if (!objective || !def) return;
    objective.requiredSheep = getRequiredSheep(def, totalSheep);
}

/**
 * Tick the objective state machine. Counts sheep in the round-up zone,
 * accumulates the hold timer, flips stage to 'drive' when the hold is
 * met. Hold-broken (count drops below threshold) resets the timer.
 *
 * No-op when objective is null or already in 'drive'. The `onStageChanged`
 * callback fires once when the stage flips to 'drive' — caller wires it
 * to `window.dispatchEvent(new CustomEvent('objective-stage-changed', …))`
 * in production, or a stub in tests. The Worker passes `null` since the
 * snapshot's `stage` field is what clients render.
 *
 * Mutates `objective` in place.
 *
 * @param {ObjectiveState | null} objective
 * @param {Array<{position: {x: number, z: number}, hasPassedGate?: boolean, isRetiring?: boolean}>} sheep
 * @param {number} deltaTime
 * @param {((nextStage: 'drive') => void) | null | undefined} [onStageChanged]
 * @returns {void}
 */
export function tickObjective(objective, sheep, deltaTime, onStageChanged) {
    if (!objective || objective.stage !== 'roundup') return;

    const zone = objective.roundupZone;
    const rSq = zone.radius * zone.radius;
    let count = 0;
    for (const s of sheep) {
        if (s.hasPassedGate || s.isRetiring) continue;
        const dx = s.position.x - zone.x;
        const dz = s.position.z - zone.z;
        if (dx * dx + dz * dz <= rSq) count++;
    }
    objective.sheepInZone = count;
    if (count >= objective.requiredSheep) {
        objective.holdTimer += deltaTime;
        if (objective.holdTimer >= objective.holdRequired) {
            objective.stage = 'drive';
            if (onStageChanged) onStageChanged('drive');
        }
    } else {
        // Hold broken — reset. Encourages keeping the flock together
        // through the full hold rather than tagging the threshold for
        // a single frame.
        objective.holdTimer = 0;
    }
}

/**
 * Predicate: is corral retirement unlocked?
 *
 *   - No objective → always open (RH/Field path; corral always accepts).
 *   - With objective → open iff stage === 'drive'.
 *
 * @param {ObjectiveState | null | undefined} objective
 * @returns {boolean}
 */
export function isCorralOpen(objective) {
    return !objective || objective.stage === 'drive';
}
