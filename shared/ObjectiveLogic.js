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
 *     objective.requiredSheepMin (default 10), then CLAMP to totalSheep so the
 *     gather gate is never larger than the flock (Cycle 58).
 *
 * For OC at fraction 0.40 + min 10:
 *   Just Play  3 →   3  (clamped: floor 1, min 10, capped at the 3-sheep flock)
 *   Quick     25 →  10
 *   Classic   50 →  20
 *   Hard     150 →  60
 *   Extreme  600 → 240
 *   Chaos   5000 → 2000
 *
 * Cycle 58 clamp: before, `max(min=10, ...)` returned 10 for any sub-10 flock,
 * making the round-up gate unwinnable below 10 sheep (a 3-sheep Just Play run
 * could never hold 10 in the zone). The `Math.min(totalSheep, ...)` clamp fixes
 * that. It changes the result ONLY when `max(min, frac*total) > total`, i.e.
 * only for `totalSheep < 10` — a regime no pre-Cycle-58 mode or committed
 * sim-baseline fixture exercised (the old floor was practice = 30), so every
 * existing trace stays byte-identical. Sole consumer: the Open Country round-up
 * win condition.
 *
 * Pure function — no side effects, no per-tick state. The formula resolves at
 * game-start, not per-tick, so sim-baseline traces are unaffected.
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
    const total = totalSheep || 0;
    return Math.min(total, Math.max(min, Math.floor(total * frac)));
}
