/** @vitest-environment jsdom */
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * [P1-SETTINGS-REBIND] Key-rebinding logic: the bindable action set, conflict
 * detection, the persistence round-trip through sds-settings, and the
 * InputHandler side of the contract (the 'keybindings-changed' event +
 * rebound camera-cycle consumption).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    DEFAULT_KEY_BINDINGS,
    getDefaultSettings,
    loadSettings,
    saveSettings,
    updateKeyBinding,
    isKeyAlreadyBound,
    getKeyBindings,
} from '../../js/components/shared/settings.js';
import { InputHandler } from '../../js/InputHandler.js';

const STORAGE_KEY = 'sds-settings';

beforeEach(() => {
    localStorage.clear();
});

describe('bindable action set', () => {
    it('covers every action the input layer reads from settings', () => {
        // InputHandler consumes exactly these: held movement + sprint, the
        // one-shot bark, the camera-cycle hotkey, and the pause toggle.
        expect(Object.keys(DEFAULT_KEY_BINDINGS).sort()).toEqual([
            'bark', 'cameraCycle', 'moveDown', 'moveLeft', 'moveRight',
            'moveUp', 'pause', 'sprint',
        ]);
    });

    it('ships the documented defaults', () => {
        expect(DEFAULT_KEY_BINDINGS).toMatchObject({
            moveUp: 'KeyW', moveDown: 'KeyS', moveLeft: 'KeyA', moveRight: 'KeyD',
            sprint: 'ShiftLeft', bark: 'Space', cameraCycle: 'KeyC', pause: 'Escape',
        });
    });
});

describe('persistence round-trip', () => {
    it('updateKeyBinding persists and loadSettings reads it back', () => {
        updateKeyBinding('sprint', 'KeyQ');
        expect(loadSettings().keyBindings.sprint).toBe('KeyQ');
        // Untouched actions keep their defaults.
        expect(loadSettings().keyBindings.moveUp).toBe('KeyW');
    });

    it('saveSettings/loadSettings round-trips a full custom binding set', () => {
        const settings = getDefaultSettings();
        settings.keyBindings = { ...DEFAULT_KEY_BINDINGS, bark: 'KeyB', cameraCycle: 'KeyV' };
        saveSettings(settings);
        const loaded = loadSettings();
        expect(loaded.keyBindings.bark).toBe('KeyB');
        expect(loaded.keyBindings.cameraCycle).toBe('KeyV');
    });

    it('merges new bindable actions into a stale persisted set', () => {
        // A player whose settings were saved before bark/cameraCycle became
        // bindable still gets both, at their defaults.
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            keyBindings: { moveUp: 'ArrowUp' },
        }));
        const loaded = loadSettings();
        expect(loaded.keyBindings.moveUp).toBe('ArrowUp');
        expect(loaded.keyBindings.bark).toBe('Space');
        expect(loaded.keyBindings.cameraCycle).toBe('KeyC');
    });

    it('dispatches keybindings-changed with the updated set', () => {
        const seen: Array<Record<string, string>> = [];
        const onChange = (e: Event) => seen.push((e as CustomEvent).detail);
        window.addEventListener('keybindings-changed', onChange);
        try {
            updateKeyBinding('bark', 'KeyB');
        } finally {
            window.removeEventListener('keybindings-changed', onChange);
        }
        expect(seen).toHaveLength(1);
        expect(seen[0].bark).toBe('KeyB');
    });
});

describe('conflict detection', () => {
    it('reports the action already holding the key', () => {
        expect(isKeyAlreadyBound('KeyW', 'moveDown')).toBe('moveUp');
        expect(isKeyAlreadyBound('Space', 'sprint')).toBe('bark');
    });

    it('excludes the action being rebound (re-pressing your own key is fine)', () => {
        expect(isKeyAlreadyBound('KeyW', 'moveUp')).toBeNull();
    });

    it('returns null for a free key', () => {
        expect(isKeyAlreadyBound('KeyZ', 'moveUp')).toBeNull();
    });

    it('checks an explicit bindings object over the persisted one', () => {
        const live = { ...DEFAULT_KEY_BINDINGS, bark: 'KeyB' };
        // Space is free in the live set even though the persisted default
        // still has bark on Space.
        expect(isKeyAlreadyBound('Space', 'sprint', live)).toBeNull();
        expect(isKeyAlreadyBound('KeyB', 'sprint', live)).toBe('bark');
    });

    it('getKeyBindings reflects the persisted set used by default checks', () => {
        updateKeyBinding('cameraCycle', 'KeyV');
        expect(getKeyBindings().cameraCycle).toBe('KeyV');
        expect(isKeyAlreadyBound('KeyV', 'sprint')).toBe('cameraCycle');
    });
});

describe('InputHandler consumption', () => {
    function pressKey(code: string) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
    }

    it('cycles the camera on the bound key and follows a rebind', () => {
        const handler = new InputHandler();
        const cycleMode = vi.fn(() => 'follow');
        handler.setCameraController({ cycleMode, applyYawDelta: () => {}, mouseYawScale: 0.005 });

        pressKey('KeyC');
        expect(cycleMode).toHaveBeenCalledTimes(1);

        window.dispatchEvent(new CustomEvent('keybindings-changed', {
            detail: { ...DEFAULT_KEY_BINDINGS, cameraCycle: 'KeyV' },
        }));

        pressKey('KeyC');
        expect(cycleMode).toHaveBeenCalledTimes(1); // old key no longer cycles
        pressKey('KeyV');
        expect(cycleMode).toHaveBeenCalledTimes(2); // new key does
    });

    it('tracks movement actions through a rebind', () => {
        const handler = new InputHandler();
        pressKey('KeyW');
        expect(handler.actions.moveUp).toBe(true);

        window.dispatchEvent(new CustomEvent('keybindings-changed', {
            detail: { ...DEFAULT_KEY_BINDINGS, moveUp: 'ArrowUp' },
        }));
        // Rebinds reset held actions so nothing sticks.
        expect(handler.actions.moveUp).toBe(false);

        pressKey('ArrowUp');
        expect(handler.actions.moveUp).toBe(true);
    });
});
