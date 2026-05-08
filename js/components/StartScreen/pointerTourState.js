/**
 * Cycle 27 Phase F — pointer-tour gating + dismissal logic, kept
 * separate from the React component so vitest can exercise it without
 * jsdom or React. Two responsibilities:
 *
 *   - shouldShowTour(): is this a first-time visitor?
 *   - markTourShown(): persist the shown state so a refresh doesn't
 *     re-show the overlay.
 *
 * The localStorage key matches the existing `sds.has-played` flag
 * (already set by GameState on session start) — completing the very
 * first round flips the flag to '1', so a returning visitor never sees
 * the tour again. We add a second key `sds.pointer-tour-shown` so that
 * a returning visitor who NEVER finished a round (rage-quit on first
 * load) doesn't see the tour every time either.
 */

export const HAS_PLAYED_KEY = 'sds.has-played';
export const TOUR_SHOWN_KEY = 'sds.pointer-tour-shown';

export const INPUT_EVENTS = ['keydown', 'pointerdown', 'touchstart'];

function safeGet(key) {
    try {
        return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch {
        return null;
    }
}

function safeSet(key, value) {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch {
        // Ignore (privacy mode, quota exceeded).
    }
}

export function shouldShowTour() {
    return safeGet(HAS_PLAYED_KEY) !== '1' && safeGet(TOUR_SHOWN_KEY) !== '1';
}

export function markTourShown() {
    safeSet(TOUR_SHOWN_KEY, '1');
}

export const __TEST_ONLY__ = { safeGet, safeSet };
