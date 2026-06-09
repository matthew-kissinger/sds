/** @vitest-environment jsdom */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * [P4-GAMEPAD-UI] Gamepad config: the prefs model (normalize + deadzone
 * clamp), the capture-flow helpers the SettingsPanel polls with (mock Gamepad
 * objects), the persistence round-trip through sds-settings, and the
 * GamepadManager side of the contract (init read + the
 * 'gamepad-prefs-changed' / 'settings-changed' live updates + remapped
 * reads + capture suppression).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    DEADZONE_MIN,
    DEADZONE_MAX,
    DEADZONE_DEFAULT,
    DEFAULT_GAMEPAD_BUTTONS,
    DEFAULT_GAMEPAD_AXES,
    getDefaultGamepadPrefs,
    clampDeadzone,
    normalizeGamepadPrefs,
} from '../../js/gamepadPrefs.js';
import {
    getGamepadButtonLabel,
    isButtonAlreadyBound,
    isAxisAlreadyBound,
    captureBaseline,
    detectNewButtonPress,
    detectMovedAxis,
    applyCircularDeadzone,
} from '../../js/components/shared/gamepadCapture.js';
import {
    getDefaultSettings,
    loadSettings,
    saveSettings,
    updateGamepadPrefs,
} from '../../js/components/shared/settings.js';
import { GamepadManager } from '../../js/GamepadManager.js';

const STORAGE_KEY = 'sds-settings';

/** Build a mock Gamepad-like object. */
function mockPad({
    buttons = 17,
    axes = [0, 0, 0, 0],
    pressed = [] as number[],
} = {}) {
    return {
        id: 'Mock Pad (STANDARD GAMEPAD)',
        index: 0,
        buttons: Array.from({ length: buttons }, (_, i) => ({
            pressed: pressed.includes(i),
            value: pressed.includes(i) ? 1 : 0,
        })),
        axes: [...axes],
    };
}

beforeEach(() => {
    localStorage.clear();
});

describe('prefs model', () => {
    it('default deadzone matches what GamepadManager shipped with', () => {
        expect(DEADZONE_DEFAULT).toBe(0.15);
        expect(getDefaultGamepadPrefs().deadzone).toBe(0.15);
    });

    it('defaults cover the full action surface on standard-mapping indices', () => {
        expect(DEFAULT_GAMEPAD_BUTTONS).toEqual({
            sprint: 7, bark: 5, zoomIn: 0, zoomOut: 1,
            bank: 2, cameraCycle: 3, note: 8, pause: 9,
        });
        expect(DEFAULT_GAMEPAD_AXES).toEqual({ moveX: 0, moveY: 1 });
    });

    it('clamps the deadzone into [0.05, 0.5]', () => {
        expect(clampDeadzone(0.01)).toBe(DEADZONE_MIN);
        expect(clampDeadzone(0.9)).toBe(DEADZONE_MAX);
        expect(clampDeadzone(0.25)).toBe(0.25);
        expect(clampDeadzone(NaN)).toBe(DEADZONE_DEFAULT);
        expect(clampDeadzone('0.3')).toBe(DEADZONE_DEFAULT);
        expect(clampDeadzone(undefined)).toBe(DEADZONE_DEFAULT);
    });

    it('normalize round-trips a valid prefs object unchanged', () => {
        const prefs = getDefaultGamepadPrefs();
        prefs.deadzone = 0.3;
        prefs.buttons.bark = 4;
        prefs.axes.moveX = 2;
        expect(normalizeGamepadPrefs(prefs)).toEqual(prefs);
    });

    it('normalize repairs corrupt, partial, and stale blobs', () => {
        expect(normalizeGamepadPrefs(null)).toEqual(getDefaultGamepadPrefs());
        expect(normalizeGamepadPrefs('garbage')).toEqual(getDefaultGamepadPrefs());

        const repaired = normalizeGamepadPrefs({
            deadzone: 4,
            buttons: { bark: -1, sprint: 1.5, zoomIn: 'A', cameraCycle: 6, stale: 12 },
            axes: { moveX: 99, moveY: 3 },
        });
        expect(repaired.deadzone).toBe(DEADZONE_MAX);
        expect(repaired.buttons.bark).toBe(DEFAULT_GAMEPAD_BUTTONS.bark);
        expect(repaired.buttons.sprint).toBe(DEFAULT_GAMEPAD_BUTTONS.sprint);
        expect(repaired.buttons.zoomIn).toBe(DEFAULT_GAMEPAD_BUTTONS.zoomIn);
        expect(repaired.buttons.cameraCycle).toBe(6);
        expect(repaired.buttons).not.toHaveProperty('stale');
        expect(repaired.axes.moveX).toBe(DEFAULT_GAMEPAD_AXES.moveX); // 99 >= 64 rejected
        expect(repaired.axes.moveY).toBe(3);
    });

    it('detects button and axis conflicts excluding the action being bound', () => {
        const { buttons, axes } = getDefaultGamepadPrefs();
        expect(isButtonAlreadyBound(5, 'sprint', buttons)).toBe('bark');
        expect(isButtonAlreadyBound(5, 'bark', buttons)).toBe(null);
        expect(isButtonAlreadyBound(15, 'bark', buttons)).toBe(null);
        expect(isAxisAlreadyBound(1, 'moveX', axes)).toBe('moveY');
        expect(isAxisAlreadyBound(1, 'moveY', axes)).toBe(null);
    });

    it('labels standard buttons by name and the rest by index', () => {
        expect(getGamepadButtonLabel(0)).toBe('A');
        expect(getGamepadButtonLabel(9)).toBe('Start');
        expect(getGamepadButtonLabel(42)).toBe('B42');
    });
});

describe('capture helpers (mock Gamepad polling)', () => {
    it('ignores buttons already held at arm time, catches the new press', () => {
        const armed = mockPad({ pressed: [7] }); // RT held while arming
        const baseline = captureBaseline(armed);
        expect(detectNewButtonPress(armed, baseline)).toBe(null);

        const stillHeld = mockPad({ pressed: [7] });
        expect(detectNewButtonPress(stillHeld, baseline)).toBe(null);

        const newPress = mockPad({ pressed: [7, 3] });
        expect(detectNewButtonPress(newPress, baseline)).toBe(3);
    });

    it('axis capture is baseline-relative so resting triggers do not self-assign', () => {
        // Axis 5 is a trigger resting at -1 on this pad.
        const armed = mockPad({ axes: [0, 0, 0, 0, 0, -1] });
        const baseline = captureBaseline(armed);
        expect(detectMovedAxis(armed, baseline)).toBe(null);

        // Small drift stays below the 0.5 threshold.
        expect(detectMovedAxis(mockPad({ axes: [0.2, 0, 0, 0, 0, -1] }), baseline)).toBe(null);

        // A real stick push wins; the largest delta is chosen.
        expect(detectMovedAxis(mockPad({ axes: [0.6, 0, -0.9, 0, 0, -1] }), baseline)).toBe(2);

        // The trigger registers once actually pulled (-1 -> 1 is a 2.0 delta).
        expect(detectMovedAxis(mockPad({ axes: [0, 0, 0, 0, 0, 1] }), baseline)).toBe(5);
    });

    it('circular deadzone zeroes below threshold and rescales above it', () => {
        expect(applyCircularDeadzone(0.1, 0, 0.15)).toEqual({ x: 0, y: 0, magnitude: 0 });
        const full = applyCircularDeadzone(1, 0, 0.15);
        expect(full.x).toBeCloseTo(1);
        expect(full.magnitude).toBeCloseTo(1);
        const mid = applyCircularDeadzone(0.5, 0, 0.5);
        expect(mid.magnitude).toBeCloseTo(0);
    });
});

describe('settings persistence round-trip', () => {
    it('getDefaultSettings carries a complete gamepad block', () => {
        expect(getDefaultSettings().gamepad).toEqual(getDefaultGamepadPrefs());
    });

    it('loadSettings normalizes a saved blob (deadzone clamp + stale repair)', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            gamepad: { deadzone: 0.02, buttons: { bark: 4 } },
        }));
        const settings = loadSettings();
        expect(settings.gamepad.deadzone).toBe(DEADZONE_MIN);
        expect(settings.gamepad.buttons.bark).toBe(4);
        expect(settings.gamepad.buttons.pause).toBe(DEFAULT_GAMEPAD_BUTTONS.pause);
        expect(settings.gamepad.axes).toEqual(DEFAULT_GAMEPAD_AXES);
    });

    it('loadSettings supplies defaults for pre-gamepad saved settings', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ audioVolume: 50 }));
        expect(loadSettings().gamepad).toEqual(getDefaultGamepadPrefs());
    });

    it('updateGamepadPrefs persists and dispatches gamepad-prefs-changed', () => {
        let eventDetail: unknown = null;
        const onChange = (e: Event) => { eventDetail = (e as CustomEvent).detail; };
        window.addEventListener('gamepad-prefs-changed', onChange);

        const prefs = getDefaultGamepadPrefs();
        prefs.deadzone = 0.3;
        prefs.buttons.cameraCycle = 11;
        updateGamepadPrefs(prefs);

        window.removeEventListener('gamepad-prefs-changed', onChange);

        const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
        expect(persisted.gamepad.deadzone).toBe(0.3);
        expect(persisted.gamepad.buttons.cameraCycle).toBe(11);
        expect(eventDetail).toEqual(persisted.gamepad);

        // Remap round-trip: a fresh load sees the same prefs.
        expect(loadSettings().gamepad).toEqual(persisted.gamepad);
    });

    it('saveSettings + loadSettings round-trips a full remap', () => {
        const settings = getDefaultSettings();
        settings.gamepad.buttons = {
            sprint: 4, bark: 7, zoomIn: 12, zoomOut: 13,
            bank: 14, cameraCycle: 15, note: 10, pause: 11,
        };
        settings.gamepad.axes = { moveX: 2, moveY: 3 };
        saveSettings(settings);
        expect(loadSettings().gamepad).toEqual(settings.gamepad);
    });
});

describe('GamepadManager contract', () => {
    function connect(gm: GamepadManager, pad: ReturnType<typeof mockPad>) {
        gm.gamepad = pad as unknown as Gamepad;
        gm.connected = true;
        gm.previousButtons = new Array(pad.buttons.length).fill(false);
    }

    it('reads persisted prefs at init', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            gamepad: { deadzone: 0.4, buttons: { cameraCycle: 6 }, axes: { moveX: 2, moveY: 3 } },
        }));
        const gm = new GamepadManager();
        expect(gm.deadzone).toBe(0.4);
        expect(gm.buttonMap.Y).toBe(6);
        expect(gm.axisMap.LEFT_X).toBe(2);
        expect(gm.axisMap.LEFT_Y).toBe(3);
    });

    it('survives a corrupt persisted blob (falls back to defaults)', () => {
        localStorage.setItem(STORAGE_KEY, 'not json');
        const gm = new GamepadManager();
        expect(gm.deadzone).toBe(DEADZONE_DEFAULT);
        expect(gm.buttonMap.START).toBe(DEFAULT_GAMEPAD_BUTTONS.pause);
    });

    it('applies gamepad-prefs-changed live', () => {
        const gm = new GamepadManager();
        const prefs = getDefaultGamepadPrefs();
        prefs.deadzone = 0.25;
        prefs.buttons.bark = 4; // bark on LB
        window.dispatchEvent(new CustomEvent('gamepad-prefs-changed', { detail: prefs }));
        expect(gm.deadzone).toBe(0.25);
        expect(gm.buttonMap.RB).toBe(4);
    });

    it('applies settings-changed (Reset All path) live', () => {
        const gm = new GamepadManager();
        gm.deadzone = 0.5;
        window.dispatchEvent(new CustomEvent('settings-changed', {
            detail: getDefaultSettings(),
        }));
        expect(gm.deadzone).toBe(DEADZONE_DEFAULT);
    });

    it('edge-detects remapped buttons through the legacy names', () => {
        const gm = new GamepadManager();
        gm.applyGamepadPrefs({ ...getDefaultGamepadPrefs(), buttons: { ...DEFAULT_GAMEPAD_BUTTONS, cameraCycle: 12 } });
        connect(gm, mockPad({ pressed: [12] }));
        expect(gm.wasJustPressed('Y')).toBe(true); // main.js polls 'Y' for camera cycle
        gm.updateButtonStates();
        expect(gm.wasJustPressed('Y')).toBe(false); // press, not hold
    });

    it('movement honors remapped axes and the configured deadzone', () => {
        const gm = new GamepadManager();
        gm.applyGamepadPrefs({ deadzone: 0.3, axes: { moveX: 2, moveY: 3 } });

        connect(gm, mockPad({ axes: [0.9, 0.9, 0.2, 0] }));
        expect(gm.getMovementDirection().x).toBe(0); // 0.2 < 0.3 deadzone on the remapped axis

        connect(gm, mockPad({ axes: [0, 0, -1, 0] }));
        const dir = gm.getMovementDirection();
        expect(dir.x).toBeCloseTo(1); // X is inverted into game space
        expect(dir.z).toBeCloseTo(0); // Vector2D carries (x, z)
    });

    it('sprint follows the remapped button and drops the axis heuristic', () => {
        const gm = new GamepadManager();
        gm.applyGamepadPrefs({ buttons: { ...DEFAULT_GAMEPAD_BUTTONS, sprint: 4 } });

        const pad = mockPad({ pressed: [4], axes: [0, 0, 0, 0, 0, 0, 0, 0] });
        connect(gm, pad);
        expect(gm.isSprinting()).toBe(true);

        // The legacy RT-axis heuristic must not fire while sprint is remapped.
        const axisOnly = mockPad({ axes: [0, 0, 0, 0, 0, 0, 0, 1] });
        connect(gm, axisOnly);
        expect(gm.isSprinting()).toBe(false);
    });

    it('keeps the RT-axis sprint heuristic at the default mapping', () => {
        const gm = new GamepadManager();
        connect(gm, mockPad({ axes: [0, 0, 0, 0, 0, 0, 0, 1] }));
        expect(gm.isSprinting()).toBe(true);
    });

    it('suppresses game reads while the Settings capture UI is armed', () => {
        const gm = new GamepadManager();
        connect(gm, mockPad({ pressed: [9], axes: [1, 0, 0, 0] }));

        window.dispatchEvent(new CustomEvent('sds-gamepad-capture', { detail: true }));
        expect(gm.isPausePressed()).toBe(false);
        expect(gm.wasJustPressed('START')).toBe(false);
        expect(gm.getMovementDirection().x).toBe(0);

        window.dispatchEvent(new CustomEvent('sds-gamepad-capture', { detail: false }));
        expect(gm.isPausePressed()).toBe(true);
    });
});
