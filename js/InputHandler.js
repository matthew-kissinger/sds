import { Vector2D } from './Vector2D.js';
import { GamepadManager } from './GamepadManager.js';

// Default key bindings (matches settings.js)
const DEFAULT_BINDINGS = {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    sprint: 'ShiftLeft',
    pause: 'Escape'
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

            // DEBUG: Instant completion for testing with 'C' key
            if (code === 'KeyC' && this.onDebugComplete) {
                console.log('[DEBUG] Triggering instant completion...');
                this.onDebugComplete();
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
        });
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
