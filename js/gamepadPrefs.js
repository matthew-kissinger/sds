// @ts-check
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Gamepad preference model. [P4-GAMEPAD-UI]
 *
 * Pure module (zero imports) shared by GamepadManager (applies the prefs to
 * its button/axis maps; this file rides the main chunk through that import,
 * so it stays model-only) and settings.js (defaults + persistence merge).
 * The Settings capture-flow helpers live in
 * js/components/shared/gamepadCapture.js so they ride the lazy
 * SettingsPanel chunk instead of main.
 *
 * Persistence shape (under the `gamepad` key of the sds-settings blob):
 *   {
 *     deadzone: 0.15,                       // clamped to [0.05, 0.5]
 *     buttons: { <action>: <buttonIndex> }, // standard-mapping indices
 *     axes:    { moveX: 0, moveY: 1 }       // left-stick movement axes
 *   }
 */

export const DEADZONE_MIN = 0.05;
export const DEADZONE_MAX = 0.5;
export const DEADZONE_DEFAULT = 0.15;

// Remappable button actions -> default standard-mapping button index.
// The action names line up with the consumers: zoomIn/zoomOut (SceneManager
// zoom), bank (Counting Sheep), cameraCycle (camera mode), bark (sheep
// impulse), sprint (movement), note (playtest note box), pause.
export const DEFAULT_GAMEPAD_BUTTONS = Object.freeze({
    sprint: 7,       // RT
    bark: 5,         // RB
    zoomIn: 0,       // A
    zoomOut: 1,      // B
    bank: 2,         // X
    cameraCycle: 3,  // Y
    note: 8,         // Select
    pause: 9         // Start
});

// Movement axes (left stick on a standard-mapping pad).
export const DEFAULT_GAMEPAD_AXES = Object.freeze({
    moveX: 0,
    moveY: 1
});

/**
 * @typedef {Object} GamepadPrefs
 * @property {number} deadzone
 * @property {Record<string, number>} buttons
 * @property {Record<string, number>} axes
 */

/** @returns {GamepadPrefs} a fresh default prefs object (deep copy). */
export function getDefaultGamepadPrefs() {
    return {
        deadzone: DEADZONE_DEFAULT,
        buttons: { ...DEFAULT_GAMEPAD_BUTTONS },
        axes: { ...DEFAULT_GAMEPAD_AXES }
    };
}

/**
 * Clamp a deadzone value into the supported range; non-finite input falls
 * back to the default.
 * @param {unknown} value
 */
export function clampDeadzone(value) {
    const n = typeof value === 'number' ? value : NaN;
    if (!Number.isFinite(n)) return DEADZONE_DEFAULT;
    return Math.min(DEADZONE_MAX, Math.max(DEADZONE_MIN, n));
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function sanitizeIndex(value, fallback) {
    return (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 64)
        ? value
        : fallback;
}

/**
 * Normalize a persisted (possibly partial, stale, or corrupt) prefs blob into
 * a complete GamepadPrefs. Unknown actions are dropped; missing ones get
 * defaults; indices are validated; the deadzone is clamped.
 * @param {unknown} raw
 * @returns {GamepadPrefs}
 */
export function normalizeGamepadPrefs(raw) {
    const prefs = getDefaultGamepadPrefs();
    if (!raw || typeof raw !== 'object') return prefs;
    const src = /** @type {Record<string, any>} */ (raw);
    prefs.deadzone = clampDeadzone(src.deadzone);
    if (src.buttons && typeof src.buttons === 'object') {
        for (const action of Object.keys(prefs.buttons)) {
            prefs.buttons[action] = sanitizeIndex(src.buttons[action], prefs.buttons[action]);
        }
    }
    if (src.axes && typeof src.axes === 'object') {
        for (const axis of Object.keys(prefs.axes)) {
            prefs.axes[axis] = sanitizeIndex(src.axes[axis], prefs.axes[axis]);
        }
    }
    return prefs;
}
