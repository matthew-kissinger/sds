// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { GamepadManager } from './GamepadManager.js';

// Default key bindings (matches settings.js)
const DEFAULT_BINDINGS = {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ShiftLeft',
    pause: 'Escape',
    bark: 'Space'
};

/**
 * Enhanced input handler for keyboard, mobile touch controls, and gamepad
 * Supports customizable key bindings
 */
export class InputHandler {
    constructor() {
        // Action states (instead of specific key states)
        this.actions = {
            moveUp: false,
            moveDown: false,
            moveLeft: false,
            moveRight: false,
            sprint: false
        };

        // Key bindings (code -> action mapping for quick lookup)
        this.keyBindings = { ...DEFAULT_BINDINGS };
        this.codeToAction = this.buildCodeToActionMap();

        this.performanceMonitor = null;
        this.isPaused = false;
        this.pauseCallbacks = [];
        this.mobileControls = null;
        this.gamepadManager = new GamepadManager();

        // Camera controller wired in from main.js — used for the `C` hotkey
        // (cycle modes) and right-mouse-drag yaw input in Free mode.
        this.cameraController = null;
        this.rightMouseDown = false;

        // Cycle 61 P3: one-shot bark command edge. Keyboard Space and the mobile
        // 'sds-bark' event queue it here; consumeBark() drains it once per frame
        // (gamepad RB is polled separately in the main loop).
        this.barkRequested = false;
        this._barkKeyHeld = false;

        // Load saved bindings
        this.loadKeyBindings();

        this.setupEventListeners();
    }

    // Build reverse lookup map: keyCode -> action
    buildCodeToActionMap() {
        const map = {};
        for (const [action, code] of Object.entries(this.keyBindings)) {
            map[code] = action;
        }
        return map;
    }

    // Load key bindings from localStorage
    loadKeyBindings() {
        try {
            const saved = localStorage.getItem('sds-settings');
            if (saved) {
                const settings = JSON.parse(saved);
                if (settings.keyBindings) {
                    this.keyBindings = { ...DEFAULT_BINDINGS, ...settings.keyBindings };
                    this.codeToAction = this.buildCodeToActionMap();
                    console.log('[INPUT] Loaded custom key bindings:', this.keyBindings);
                }
            }
        } catch (error) {
            console.warn('[INPUT] Failed to load key bindings:', error);
        }
    }

    // Update key bindings at runtime
    updateKeyBindings(newBindings) {
        this.keyBindings = { ...DEFAULT_BINDINGS, ...newBindings };
        this.codeToAction = this.buildCodeToActionMap();
        console.log('[INPUT] Updated key bindings:', this.keyBindings);

        // Reset all actions when bindings change
        for (const action in this.actions) {
            this.actions[action] = false;
        }
    }

    setupEventListeners() {
        // Listen for key binding changes from settings
        window.addEventListener('keybindings-changed', (event) => {
            this.updateKeyBindings(event.detail);
        });

        // Cycle 61 P3: the mobile bark button dispatches this; queue a one-shot bark.
        window.addEventListener('sds-bark', () => { this.barkRequested = true; });

        // Keydown event
        window.addEventListener('keydown', (event) => {
            const code = event.code;

            // Handle pause toggle
            if (code === this.keyBindings.pause || code === 'Escape') {
                this.togglePause();
                event.preventDefault();
                return;
            }

            // Skip game input processing if typing in text field
            if (window.isTypingInInput) {
                return;
            }

            // Only process other keys if not paused
            if (this.isPaused) {
                event.preventDefault();
                return;
            }

            // Check if this key is bound to an action
            const action = this.codeToAction[code];
            if (action && action in this.actions) {
                this.actions[action] = true;
                event.preventDefault();
            }

            // Cycle 61 P3: bark is a one-shot command, not a held action. Edge-
            // detect with _barkKeyHeld so key-repeat can't machine-gun it. Skip
            // when a menu/interactive element is focused so Space still activates
            // it (the entrance/pause use native focus from Cycle 60).
            if (code === this.keyBindings.bark) {
                const ae = document.activeElement;
                const interactive = !!ae && (ae.tagName === 'BUTTON' || ae.tagName === 'A' ||
                    ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA' ||
                    ae.isContentEditable);
                if (!interactive) {
                    if (!this._barkKeyHeld) {
                        this.barkRequested = true;
                        this._barkKeyHeld = true;
                    }
                    event.preventDefault();
                }
            }

            // Also handle Shift variants (left/right)
            if (code === 'ShiftLeft' || code === 'ShiftRight') {
                if (this.keyBindings.sprint === 'ShiftLeft' || this.keyBindings.sprint === 'ShiftRight') {
                    this.actions.sprint = true;
                    event.preventDefault();
                }
            }

            // Performance monitor toggle with 'P' key
            if (code === 'KeyP' && this.performanceMonitor) {
                this.performanceMonitor.toggle();
                event.preventDefault();
            }

            // Cycle camera mode (Classic -> Follow -> Free) with 'C'
            if (code === 'KeyC' && this.cameraController) {
                const next = this.cameraController.cycleMode();
                console.log(`[CAMERA] Mode -> ${next}`);
                window.dispatchEvent(new CustomEvent('camera-mode-changed', { detail: next }));
                event.preventDefault();
            }
        });

        // Keyup event
        window.addEventListener('keyup', (event) => {
            const code = event.code;

            // Check if this key is bound to an action
            const action = this.codeToAction[code];
            if (action && action in this.actions) {
                this.actions[action] = false;
                event.preventDefault();
            }

            // Cycle 61 P3: release the bark edge so the next press re-arms it.
            if (code === this.keyBindings.bark) {
                this._barkKeyHeld = false;
            }

            // Also handle Shift variants
            if (code === 'ShiftLeft' || code === 'ShiftRight') {
                if (this.keyBindings.sprint === 'ShiftLeft' || this.keyBindings.sprint === 'ShiftRight') {
                    this.actions.sprint = false;
                    event.preventDefault();
                }
            }
        });

        // Reset keys when window loses focus
        window.addEventListener('blur', () => {
            for (const action in this.actions) {
                this.actions[action] = false;
            }
            this.rightMouseDown = false;
            // Cycle 61 P3: clear any half-held bark edge on focus loss.
            this.barkRequested = false;
            this._barkKeyHeld = false;
        });

        this.setupMouseCameraControls();
    }

    // Right-mouse-button drag → camera yaw delta. Only meaningful when the
    // camera is in FREE mode (CameraController.applyYawDelta is a no-op
    // otherwise). Suppresses the canvas context menu so the drag is usable.
    setupMouseCameraControls() {
        const target = window;

        target.addEventListener('contextmenu', (event) => {
            // Only suppress on the game canvas — leave HTML UI menus alone.
            if (event.target && event.target.tagName === 'CANVAS') {
                event.preventDefault();
            }
        });

        target.addEventListener('mousedown', (event) => {
            if (event.button === 2 && event.target && event.target.tagName === 'CANVAS') {
                this.rightMouseDown = true;
            }
        });

        target.addEventListener('mouseup', (event) => {
            if (event.button === 2) this.rightMouseDown = false;
        });

        target.addEventListener('mousemove', (event) => {
            if (!this.rightMouseDown || !this.cameraController) return;
            this.cameraController.applyYawDelta(event.movementX * this.cameraController.mouseYawScale);
        });
    }

    setCameraController(controller) {
        this.cameraController = controller;
    }

    // Set mobile controls reference
    setMobileControls(mobileControls) {
        this.mobileControls = mobileControls;
    }

    // Toggle pause state
    togglePause() {
        this.isPaused = !this.isPaused;

        // Clear all actions when pausing
        if (this.isPaused) {
            for (const action in this.actions) {
                this.actions[action] = false;
            }
        }

        // Notify all registered callbacks about pause state change
        this.pauseCallbacks.forEach(callback => callback(this.isPaused));

        // Dispatch custom event for React PauseMenu
        window.dispatchEvent(new CustomEvent('game-pause-change', {
            detail: { isPaused: this.isPaused }
        }));
    }

    // Register a callback to be called when pause state changes
    onPauseToggle(callback) {
        this.pauseCallbacks.push(callback);
    }

    // Legacy updatePauseUI - now handled by React PauseMenu component
    updatePauseUI() {
        // Pause UI is now handled by React PauseMenu component
    }

    // Get movement direction based on current input state (gamepad + keyboard + mobile)
    getMovementDirection() {
        // Return zero movement if paused
        if (this.isPaused) {
            return new Vector2D(0, 0);
        }

        // Update gamepad state
        this.gamepadManager.update();

        // Check gamepad input first (highest priority)
        if (this.gamepadManager.isConnected()) {
            const gamepadDirection = this.gamepadManager.getMovementDirection();
            if (gamepadDirection.magnitude() > 0) {
                return gamepadDirection;
            }
        }

        // Fall back to keyboard input using actions
        const direction = new Vector2D(0, 0);

        if (this.actions.moveUp) direction.z += 1;
        if (this.actions.moveDown) direction.z -= 1;
        if (this.actions.moveLeft) direction.x += 1;
        if (this.actions.moveRight) direction.x -= 1;

        // Add mobile input if available and no keyboard input
        if (this.mobileControls && this.mobileControls.getIsTouchDevice()) {
            const mobileDirection = this.mobileControls.getMovementDirection();

            // If no keyboard input, use mobile input
            if (direction.magnitude() === 0) {
                direction.x = mobileDirection.x;
                direction.z = mobileDirection.z;
            }
        }

        return direction;
    }

    // Check if any movement input is active
    isMoving() {
        // Return false if paused
        if (this.isPaused) {
            return false;
        }

        // Check gamepad input first
        if (this.gamepadManager.isConnected()) {
            const gamepadDirection = this.gamepadManager.getMovementDirection();
            if (gamepadDirection.magnitude() > 0) {
                return true;
            }
        }

        // Check keyboard input
        const keyboardMoving = this.actions.moveUp || this.actions.moveDown ||
                               this.actions.moveLeft || this.actions.moveRight;

        // Check mobile input
        const mobileMoving = this.mobileControls &&
                            this.mobileControls.getIsTouchDevice() &&
                            this.mobileControls.getIsMoving();

        return keyboardMoving || mobileMoving;
    }

    // Check if sprint input is active (gamepad trigger, keyboard shift, or mobile sprint button)
    isSprinting() {
        // Return false if paused
        if (this.isPaused) {
            return false;
        }

        // Check gamepad sprint first (highest priority)
        if (this.gamepadManager.isConnected() && this.gamepadManager.isSprinting()) {
            return true;
        }

        // Check keyboard sprint
        const keyboardSprinting = this.actions.sprint;

        // Check mobile sprint
        const mobileSprinting = this.mobileControls &&
                               this.mobileControls.getIsTouchDevice() &&
                               this.mobileControls.getIsSprinting();

        return keyboardSprinting || mobileSprinting;
    }

    /**
     * Cycle 61 P3: consume a queued one-shot bark command. Returns true at most
     * once per physical press (keyboard Space or the mobile 'sds-bark' event);
     * gamepad RB is edge-polled separately in the main loop. Drained per frame.
     */
    consumeBark() {
        if (!this.barkRequested) return false;
        this.barkRequested = false;
        return true;
    }

    // Check if game is paused
    isPausedState() {
        return this.isPaused;
    }

    // Set performance monitor reference for toggle functionality
    setPerformanceMonitor(performanceMonitor) {
        this.performanceMonitor = performanceMonitor;
    }

    // Set debug completion callback for testing
    setDebugCompleteCallback(callback) {
        this.onDebugComplete = callback;
    }

    // Get gamepad manager for debugging
    getGamepadManager() {
        return this.gamepadManager;
    }

    // Legacy compatibility - get keys object
    get keys() {
        return {
            w: this.actions.moveUp,
            a: this.actions.moveLeft,
            s: this.actions.moveDown,
            d: this.actions.moveRight,
            shift: this.actions.sprint
        };
    }
}
