// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * The day/phase clock math - pure, render-free.
 *
 * Cycle 67 P3: PROMOTED from `js/gamestate/dayLoop.js` (Cycle 65) so the Worker
 * `GameSim` can run the survival day clock authoritatively for co-op. The
 * `DayLoop` CLASS stays in `js/` (it drives the client HUD); only the pure phase
 * math moves here so client + DO share ONE definition of "what phase is it" and
 * can never drift. `js/gamestate/dayLoop.js` re-imports these.
 *
 * No DOM, no Three, no `Math.random`, no `Date.now`. `secondsToT` lets the DO
 * derive the normalized time-of-day from its own elapsed-time accumulator and
 * the scene's `dayNight.secondsPerDay`, the same `t` the client reads from the
 * atmosphere's DayNightCycle.
 */

/** @enum {string} */
export const DayPhase = {
    MORNING: 'morning',
    DAY: 'day',
    DUSK: 'dusk',
    NIGHT: 'night',
};

// Phase boundaries in normalized time-of-day. Sunrise ~0.25, noon 0.5, sunset
// ~0.75 (the DayNightCycle keyframes). The gate opens at dawn and closes at
// night; dusk is the warning window before the gate shuts.
export const DAWN_T = 0.25;       // night -> morning (gate opens)
export const MORNING_END_T = 0.36;
export const DUSK_START_T = 0.66; // day -> dusk (herd-back warning)
export const NIGHT_T = 0.80;      // dusk -> night (gate closes)

/** Wrap any number into [0,1). */
export function wrap01(t) {
    if (!Number.isFinite(t)) return 0;
    const v = t % 1;
    return v < 0 ? v + 1 : v;
}

/**
 * Convert an elapsed-seconds accumulator into a normalized time-of-day, given
 * the scene's day length and starting offset. The DO advances `elapsed` by its
 * tick dt and reads the phase from the result.
 * @param {number} elapsedSeconds
 * @param {number} secondsPerDay
 * @param {number} [initialT=0.28]
 * @returns {number} t in [0,1)
 */
export function secondsToT(elapsedSeconds, secondsPerDay, initialT = 0.28) {
    const per = (Number.isFinite(secondsPerDay) && secondsPerDay > 0) ? secondsPerDay : 600;
    const e = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
    return wrap01(initialT + e / per);
}

/**
 * Map a normalized time-of-day to a day phase.
 * @param {number} t
 * @returns {DayPhase}
 */
export function phaseForT(t) {
    const tn = wrap01(t);
    if (tn < DAWN_T || tn >= NIGHT_T) return DayPhase.NIGHT;
    if (tn < MORNING_END_T) return DayPhase.MORNING;
    if (tn < DUSK_START_T) return DayPhase.DAY;
    return DayPhase.DUSK;
}

/**
 * The gate is open from dawn through dusk and closed at night.
 * @param {DayPhase} phase
 * @returns {boolean}
 */
export function gateOpenForPhase(phase) {
    return phase !== DayPhase.NIGHT;
}
