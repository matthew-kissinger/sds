// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Cycle 17 Phase 6 — objective-derived helpers.
 *
 * Single source of truth for the round-up `requiredSheep` count, which
 * scales with the per-mode total sheep population on scenes that opt
 * into fractional gating.
 *
 * Semantics:
 *   - If objective.requiredSheep is set explicitly, use that (legacy +
 *     opt-out for non-scaling scenes).
 *   - Otherwise compute Math.max(min, floor(totalSheep * fraction))
 *     using objective.requiredSheepFraction (default 0.40) +
 *     objective.requiredSheepMin (default 10).
 *
 * For OC at fraction 0.40 + min 10:
 *   Classic  200 →  80
 *   Extreme 1000 → 400
 *   Insane  3000 → 1200
 *   Chaos   5000 → 2000
 *
 * Pure function — no side effects, no per-tick state. Sim-baseline traces
 * are unaffected (formula resolves at game-start, not per-tick).
 *
 * @param {import('./scenes/types.js').ObjectiveDef | null | undefined} objective
 * @param {number} totalSheep
 * @returns {number}
 */
export function getRequiredSheep(objective, totalSheep) {
    if (!objective) return 0;
    if (typeof objective.requiredSheep === 'number') return objective.requiredSheep;
    const frac = typeof objective.requiredSheepFraction === 'number'
        ? objective.requiredSheepFraction
        : 0.40;
    const min = typeof objective.requiredSheepMin === 'number'
        ? objective.requiredSheepMin
        : 10;
    return Math.max(min, Math.floor((totalSheep || 0) * frac));
}
