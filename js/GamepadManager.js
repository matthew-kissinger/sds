// @ts-check
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { normalizeGamepadPrefs, DEFAULT_GAMEPAD_BUTTONS } from './gamepadPrefs.js';

/**
 * GamepadManager - Robust gamepad input handling for desktop users
 * Follows modern game development architecture with proper deadzone handling
 */
export class GamepadManager {
    constructor() {
        this.gamepad = null;
        this.connected = false;
        /** @type {boolean[]} */
        this.previousButtons = [];
        this.deadzone = 0.15; // Configurable deadzone for analog sticks
        this.triggerThreshold = 0.1; // Threshold for trigger activation

        // Button mappings (standard gamepad layout)
        /** @type {Record<string, number>} */
        this.buttonMap = {
            A: 0,        // A button - Zoom In
            B: 1,        // B button - Zoom Out
            X: 2,        // X button - Bank (Counting Sheep)
            Y: 3,        // Y button - Cycle camera
            LB: 4,       // Left bumper (unused)
            RB: 5,       // Right bumper - Bark
            LT: 6,       // Left trigger (unused)
            RT: 7,       // Right trigger - Sprint (axis fallback below)
            SELECT: 8,   // Select/Back button - Playtest note
            START: 9,    // Start/Menu button - Pause
            LS: 10,      // Left stick button (unused)
            RS: 11,      // Right stick button (unused)
            DPAD_UP: 12,    // D-pad up (unused)
            DPAD_DOWN: 13,  // D-pad down (unused)
            DPAD_LEFT: 14,  // D-pad left (unused)
            DPAD_RIGHT: 15  // D-pad right (unused)
        };

        // Axis mappings
        /** @type {Record<string, number>} */
        this.axisMap = {
            LEFT_X: 0,      // Left stick horizontal
            LEFT_Y: 1,      // Left stick vertical
            RIGHT_X: 2,     // Right stick horizontal (unused)
            RIGHT_Y: 3,     // Right stick vertical (unused)
            RT_AXIS: 7      // Right trigger axis (varies by controller)
        };

        // Connection state tracking
        this.connectionState = 'disconnected';
        this.lastConnectionCheck = 0;
        this.connectionCheckInterval = 100; // Check every 100ms

        // [P4-GAMEPAD-UI] While the Settings capture UI is armed, game-facing
        // reads are suppressed so binding Start/A does not also toggle
        // pause/zoom mid-capture.
        this.uiCaptureActive = false;

        // [P4-GAMEPAD-UI] Persisted prefs (deadzone + button/axis remap):
        // read once at init, then kept live via the settings events below.
        this.applyGamepadPrefs(this._loadPersistedPrefs());

        this.setupGamepadEvents();
        console.log('[GAMEPAD] GamepadManager initialized');
    }

    /**
     * Read the gamepad prefs block from the persisted sds-settings blob.
     * Mirrors InputHandler.loadKeyBindings: a direct localStorage read keeps
     * the input path free of the React-side settings module.
     * @returns {unknown}
     */
    _loadPersistedPrefs() {
        try {
            const saved = typeof localStorage !== 'undefined' && localStorage.getItem('sds-settings');
            if (saved) return JSON.parse(saved).gamepad;
        } catch (error) {
            console.warn('[GAMEPAD] Failed to load gamepad prefs:', error);
        }
        return null;
    }

    /**
     * Apply a (possibly partial/raw) prefs blob to the live maps. The Settings
     * panel edits action names (sprint, bark, zoomIn, ...); this translates
     * them onto the legacy physical-name maps so every existing consumer
     * (main.js wasJustPressed('Y'), SceneManager zoom, pause) follows the
     * remap without changes.
     * @param {unknown} rawPrefs
     */
    applyGamepadPrefs(rawPrefs) {
        const prefs = normalizeGamepadPrefs(rawPrefs);
        this.deadzone = prefs.deadzone;
        this.buttonMap.A = prefs.buttons.zoomIn;
        this.buttonMap.B = prefs.buttons.zoomOut;
        this.buttonMap.X = prefs.buttons.bank;
        this.buttonMap.Y = prefs.buttons.cameraCycle;
        this.buttonMap.RB = prefs.buttons.bark;
        this.buttonMap.RT = prefs.buttons.sprint;
        this.buttonMap.SELECT = prefs.buttons.note;
        this.buttonMap.START = prefs.buttons.pause;
        this.axisMap.LEFT_X = prefs.axes.moveX;
        this.axisMap.LEFT_Y = prefs.axes.moveY;
    }

    /**
     * Set up gamepad connection/disconnection event listeners
     */
    setupGamepadEvents() {
        if (typeof window === 'undefined') return;

        window.addEventListener('gamepadconnected', (event) => {
            this.onGamepadConnected(event);
        });

        window.addEventListener('gamepaddisconnected', (event) => {
            this.onGamepadDisconnected(event);
        });

        // [P4-GAMEPAD-UI] Live prefs updates: the Settings gamepad section
        // dispatches 'gamepad-prefs-changed' on every remap/deadzone edit;
        // 'settings-changed' covers the Reset All path (applySettingsToGame).
        window.addEventListener('gamepad-prefs-changed', (event) => {
            this.applyGamepadPrefs(/** @type {CustomEvent} */ (event).detail);
        });

        window.addEventListener('settings-changed', (event) => {
            const detail = /** @type {CustomEvent} */ (event).detail;
            if (detail && detail.gamepad) this.applyGamepadPrefs(detail.gamepad);
        });

        window.addEventListener('sds-gamepad-capture', (event) => {
            this.uiCaptureActive = !!(/** @type {CustomEvent} */ (event).detail);
        });
    }
    
    /**
     * Handle gamepad connection
     * @param {GamepadEvent} event
     */
    onGamepadConnected(event) {
        this.gamepad = event.gamepad;
        this.connected = true;
        this.connectionState = 'connected';
        this.previousButtons = new Array(this.gamepad.buttons.length).fill(false);
        
        console.log('[GAMEPAD] Gamepad connected:', {
            id: event.gamepad.id,
            buttons: event.gamepad.buttons.length,
            axes: event.gamepad.axes.length
        });
        
        // Show connection notification
        this.showConnectionNotification(true);
    }
    
    /**
     * Handle gamepad disconnection
     * @param {GamepadEvent} event
     */
    onGamepadDisconnected(event) {
        this.connected = false;
        this.connectionState = 'disconnected';
        this.gamepad = null;
        
        console.log('[GAMEPAD] Gamepad disconnected:', event.gamepad.id);
        
        // Show disconnection notification
        this.showConnectionNotification(false);
    }
    
    /**
     * Update gamepad state - should be called every frame
     */
    update() {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
            return;
        }

        const now = performance.now();
        
        // Periodically check for gamepad connection changes
        if (now - this.lastConnectionCheck > this.connectionCheckInterval) {
            this.checkGamepadConnection();
            this.lastConnectionCheck = now;
        }
        
        if (!this.connected || !this.gamepad) {
            return;
        }
        
        // Update gamepad state
        const gamepads = navigator.getGamepads();
        this.gamepad = gamepads[this.gamepad.index];
        
        if (!this.gamepad) {
            this.connected = false;
            this.connectionState = 'disconnected';
            return;
        }
        
        // Update button states for edge detection
        this.updateButtonStates();
    }
    
    /**
     * Check for gamepad connection changes
     */
    checkGamepadConnection() {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
            return;
        }

        const gamepads = navigator.getGamepads();
        let foundGamepad = false;
        
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                if (!this.connected) {
                    // New gamepad found
                    this.gamepad = gamepads[i];
                    this.connected = true;
                    this.connectionState = 'connected';
                    this.previousButtons = new Array(this.gamepad.buttons.length).fill(false);
                    console.log('[GAMEPAD] Gamepad detected:', this.gamepad.id);
                    this.showConnectionNotification(true);
                }
                foundGamepad = true;
                break;
            }
        }
        
        if (!foundGamepad && this.connected) {
            // Gamepad was disconnected
            this.connected = false;
            this.connectionState = 'disconnected';
            this.gamepad = null;
            console.log('[GAMEPAD] Gamepad connection lost');
            this.showConnectionNotification(false);
        }
    }
    
    /**
     * Update button states for edge detection
     */
    updateButtonStates() {
        if (!this.gamepad) return;
        
        for (let i = 0; i < this.gamepad.buttons.length; i++) {
            this.previousButtons[i] = this.gamepad.buttons[i].pressed;
        }
    }
    
    /**
     * Check if gamepad is connected
     */
    isConnected() {
        return this.connected;
    }
    
    /**
     * Get movement direction from left analog stick
     */
    getMovementDirection() {
        if (!this.connected || !this.gamepad || this.uiCaptureActive) {
            return new Vector2D(0, 0);
        }
        
        const leftX = this.gamepad.axes[this.axisMap.LEFT_X] || 0;
        const leftY = this.gamepad.axes[this.axisMap.LEFT_Y] || 0;
        
        // Apply circular deadzone
        const magnitude = Math.sqrt(leftX * leftX + leftY * leftY);
        
        if (magnitude < this.deadzone) {
            return new Vector2D(0, 0);
        }
        
        // Normalize and adjust for deadzone
        const normalizedMagnitude = Math.min(1.0, (magnitude - this.deadzone) / (1.0 - this.deadzone));
        const normalizedX = (leftX / magnitude) * normalizedMagnitude;
        const normalizedY = (leftY / magnitude) * normalizedMagnitude;
        
        // Convert to game coordinate system (Z is forward, X is right)
        // Invert X axis to fix left/right movement
        return new Vector2D(-normalizedX, -normalizedY);
    }
    
    /**
     * Check if sprint input is active (right trigger)
     */
    isSprinting() {
        if (!this.connected || !this.gamepad || this.uiCaptureActive) {
            return false;
        }

        // Configured sprint button (default RT, remappable via Settings)
        if (this.gamepad.buttons[this.buttonMap.RT]?.pressed) {
            return true;
        }

        // Legacy non-standard pads expose RT as an axis; keep that heuristic
        // only while sprint sits on its default button so a remap wins.
        if (this.buttonMap.RT === DEFAULT_GAMEPAD_BUTTONS.sprint &&
            this.gamepad.axes[this.axisMap.RT_AXIS] !== undefined) {
            return this.gamepad.axes[this.axisMap.RT_AXIS] > this.triggerThreshold;
        }

        return false;
    }
    
    /**
     * Right-stick X axis after circular deadzone, normalized to [-1, 1].
     * Positive = camera yaws right.
     */
    getRightStickX() {
        return this._deadzonedAxis(this.axisMap.RIGHT_X, this.axisMap.RIGHT_Y);
    }

    /**
     * Right-stick Y axis after circular deadzone, normalized to [-1, 1].
     * Positive = down on the stick.
     */
    getRightStickY() {
        return this._deadzonedAxis(this.axisMap.RIGHT_Y, this.axisMap.RIGHT_X);
    }

    /**
     * @param {number} primaryIndex
     * @param {number} otherIndex
     */
    _deadzonedAxis(primaryIndex, otherIndex) {
        if (!this.connected || !this.gamepad || this.uiCaptureActive) return 0;
        const primary = this.gamepad.axes[primaryIndex] || 0;
        const other = this.gamepad.axes[otherIndex] || 0;
        const mag = Math.sqrt(primary * primary + other * other);
        if (mag < this.deadzone) return 0;
        const norm = Math.min(1, (mag - this.deadzone) / (1 - this.deadzone));
        return (primary / mag) * norm;
    }

    /**
     * Check if zoom in button is pressed (A button)
     */
    isZoomInPressed() {
        if (!this.connected || !this.gamepad || this.uiCaptureActive) {
            return false;
        }
        
        return this.gamepad.buttons[this.buttonMap.A]?.pressed || false;
    }
    
    /**
     * Check if zoom out button is pressed (B button)
     */
    isZoomOutPressed() {
        if (!this.connected || !this.gamepad || this.uiCaptureActive) {
            return false;
        }
        
        return this.gamepad.buttons[this.buttonMap.B]?.pressed || false;
    }
    
    /**
     * Check if pause button was just pressed (Start button - edge detection)
     */
    isPausePressed() {
        if (!this.connected || !this.gamepad || this.uiCaptureActive) {
            return false;
        }
        
        const currentState = this.gamepad.buttons[this.buttonMap.START]?.pressed || false;
        const previousState = this.previousButtons[this.buttonMap.START] || false;
        
        // Return true only on button press (not hold)
        return currentState && !previousState;
    }

    /**
     * Cycle 60 P4: edge-detect any mapped button by name (press, not hold).
     * Shares the previousButtons array that isPausePressed relies on, so the
     * timing matches the existing pause edge.
     * @param {string} buttonName
     */
    wasJustPressed(buttonName) {
        if (!this.connected || !this.gamepad || this.uiCaptureActive) return false;
        const idx = this.buttonMap[buttonName];
        if (idx === undefined) return false;
        const current = this.gamepad.buttons[idx]?.pressed || false;
        const previous = this.previousButtons[idx] || false;
        return current && !previous;
    }

    /**
     * Get current button state for debugging
     * @param {string} buttonName
     */
    getButtonState(buttonName) {
        if (!this.connected || !this.gamepad || !this.buttonMap[buttonName]) {
            return false;
        }
        
        return this.gamepad.buttons[this.buttonMap[buttonName]]?.pressed || false;
    }
    
    /**
     * Get current axis value for debugging
     * @param {string} axisName
     */
    getAxisValue(axisName) {
        if (!this.connected || !this.gamepad || this.axisMap[axisName] === undefined) {
            return 0;
        }
        
        return this.gamepad.axes[this.axisMap[axisName]] || 0;
    }
    
    /**
     * Set deadzone value
     * @param {number} deadzone
     */
    setDeadzone(deadzone) {
        this.deadzone = Math.max(0, Math.min(1, deadzone));
        console.log('[GAMEPAD] Gamepad deadzone set to:', this.deadzone);
    }
    
    /**
     * Show gamepad connection notification
     * @param {boolean} connected
     */
    showConnectionNotification(connected) {
        // Remove existing notification
        const existing = document.getElementById('gamepad-notification');
        if (existing) {
            existing.remove();
        }
        
        // Create new notification
        const notification = document.createElement('div');
        notification.id = 'gamepad-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${connected ? 'rgba(0, 150, 0, 0.9)' : 'rgba(150, 0, 0, 0.9)'};
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 10000;
            opacity: 1;
            transition: opacity 0.3s ease;
            pointer-events: none;
        `;
        
        notification.innerHTML = `
            Gamepad ${connected ? 'Connected' : 'Disconnected'}
            ${connected ? '<br><small>Left stick moves, A/B zoom, Start confirms menus</small>' : ''}
        `;
        
        document.body.appendChild(notification);
        
        // Fade out after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
    /**
     * Get debug information
     */
    getDebugInfo() {
        if (!this.connected || !this.gamepad) {
            return {
                connected: false,
                id: null,
                buttons: 0,
                axes: 0
            };
        }
        
        return {
            connected: true,
            id: this.gamepad.id,
            buttons: this.gamepad.buttons.length,
            axes: this.gamepad.axes.length,
            leftStick: {
                x: this.gamepad.axes[this.axisMap.LEFT_X] || 0,
                y: this.gamepad.axes[this.axisMap.LEFT_Y] || 0
            },
            rightTrigger: this.gamepad.axes[this.axisMap.RT_AXIS] || 0,
            buttonStates: {
                A: this.gamepad.buttons[this.buttonMap.A]?.pressed || false,
                B: this.gamepad.buttons[this.buttonMap.B]?.pressed || false,
                START: this.gamepad.buttons[this.buttonMap.START]?.pressed || false
            }
        };
    }
}
