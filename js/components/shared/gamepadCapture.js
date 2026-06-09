// @ts-check
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Gamepad capture-flow helpers for the Settings panel. [P4-GAMEPAD-UI]
 *
 * Pure functions over Gamepad-like objects (mockable in tests, no DOM). Kept
 * separate from js/gamepadPrefs.js on purpose: GamepadManager imports the
 * prefs model into the main chunk, while these helpers are only needed by
 * the lazy-loaded SettingsPanel chunk.
 */

// Standard-mapping button names for display. Indices past the table render
// as "B<n>".
const BUTTON_LABELS = [
    'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT',
    'Select', 'Start', 'L3', 'R3',
    'D-Up', 'D-Down', 'D-Left', 'D-Right', 'Home'
];

/** @param {number} index */
export function getGamepadButtonLabel(index) {
    return BUTTON_LABELS[index] || `B${index}`;
}

/**
 * Find the action (other than excludeAction) a button index is already
 * assigned to, or null.
 * @param {number} index
 * @param {string} excludeAction
 * @param {Record<string, number>} buttons
 */
export function isButtonAlreadyBound(index, excludeAction, buttons) {
    for (const [action, assigned] of Object.entries(buttons)) {
        if (action !== excludeAction && assigned === index) return action;
    }
    return null;
}

/**
 * Find the axis assignment (other than excludeAxis) an axis index is already
 * used by, or null.
 * @param {number} index
 * @param {string} excludeAxis
 * @param {Record<string, number>} axes
 */
export function isAxisAlreadyBound(index, excludeAxis, axes) {
    for (const [axis, assigned] of Object.entries(axes)) {
        if (axis !== excludeAxis && assigned === index) return axis;
    }
    return null;
}

/**
 * Snapshot the capture baseline for a Gamepad-like object: which buttons are
 * held and where each axis rests. Taken when the capture UI arms so held
 * buttons and stick drift do not instantly self-assign.
 * @param {{ buttons: ArrayLike<{ pressed: boolean }>, axes: ArrayLike<number> }} gamepad
 */
export function captureBaseline(gamepad) {
    return {
        pressed: Array.from(gamepad.buttons, (b) => !!b?.pressed),
        axes: Array.from(gamepad.axes, (a) => (typeof a === 'number' ? a : 0))
    };
}

/**
 * Poll step for button capture: the lowest button index that is pressed now
 * but was not pressed in the baseline, or null.
 * @param {{ buttons: ArrayLike<{ pressed: boolean }> }} gamepad
 * @param {{ pressed: boolean[] }} baseline
 * @returns {number | null}
 */
export function detectNewButtonPress(gamepad, baseline) {
    for (let i = 0; i < gamepad.buttons.length; i++) {
        if (gamepad.buttons[i]?.pressed && !baseline.pressed[i]) return i;
    }
    return null;
}

const AXIS_CAPTURE_THRESHOLD = 0.5;

/**
 * Poll step for axis capture: the axis that moved furthest from its baseline
 * rest position, if it moved past the threshold. Baseline-relative so
 * triggers that rest at -1 do not self-assign.
 * @param {{ axes: ArrayLike<number> }} gamepad
 * @param {{ axes: number[] }} baseline
 * @returns {number | null}
 */
export function detectMovedAxis(gamepad, baseline) {
    let best = null;
    let bestDelta = AXIS_CAPTURE_THRESHOLD;
    for (let i = 0; i < gamepad.axes.length; i++) {
        const value = typeof gamepad.axes[i] === 'number' ? gamepad.axes[i] : 0;
        const delta = Math.abs(value - (baseline.axes[i] || 0));
        if (delta > bestDelta) {
            best = i;
            bestDelta = delta;
        }
    }
    return best;
}

/**
 * Circular deadzone with rescale, identical math to
 * GamepadManager.getMovementDirection. Used by the Settings live preview so
 * the meter shows exactly what the game will read.
 * @param {number} x
 * @param {number} y
 * @param {number} deadzone
 * @returns {{ x: number, y: number, magnitude: number }}
 */
export function applyCircularDeadzone(x, y, deadzone) {
    const magnitude = Math.sqrt(x * x + y * y);
    if (magnitude < deadzone) return { x: 0, y: 0, magnitude: 0 };
    const normalized = Math.min(1, (magnitude - deadzone) / (1 - deadzone));
    return {
        x: (x / magnitude) * normalized,
        y: (y / magnitude) * normalized,
        magnitude: normalized
    };
}
