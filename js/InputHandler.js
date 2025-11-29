import { Vector2D } from './Vector2D.js';
import { GamepadManager } from './GamepadManager.js';

/**
 * Enhanced input handler for keyboard, mobile touch controls, and gamepad
 */
export class InputHandler {
    constructor() {
        this.keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            shift: false
        };
        
        this.performanceMonitor = null;
        this.isPaused = false;
        this.pauseCallbacks = [];
        this.mobileControls = null;
        this.gamepadManager = new GamepadManager();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Keydown event
        window.addEventListener('keydown', (event) => {
            const key = event.key.toLowerCase();
            
            // Handle pause toggle with Escape key
            if (event.key === 'Escape') {
                this.togglePause();
                event.preventDefault();
                return;
            }
            
            // Skip game input processing if typing in text field
            if (window.isTypingInInput && (key in this.keys || event.key === 'Shift')) {
                return; // Don't preventDefault, let the input field handle it
            }
            
            // Only process other keys if not paused
            if (this.isPaused) {
                event.preventDefault();
                return;
            }
            
            if (key in this.keys) {
                this.keys[key] = true;
                event.preventDefault();
            } else if (event.key === 'Shift') {
                this.keys.shift = true;
                event.preventDefault();
            } else if (key === 'p' && this.performanceMonitor) {
                // Toggle performance monitor with 'P' key
                this.performanceMonitor.toggle();
                event.preventDefault();
            } else if (key === 'c' && this.onDebugComplete) {
                // DEBUG: Instant completion for testing with 'C' key
                console.log('[DEBUG] Triggering instant completion...');
                this.onDebugComplete();
                event.preventDefault();
            }
        });

        // Keyup event
        window.addEventListener('keyup', (event) => {
            const key = event.key.toLowerCase();
            
            // Don't process movement key releases if paused
            if (this.isPaused && key in this.keys) {
                event.preventDefault();
                return;
            }
            
            if (key in this.keys) {
                this.keys[key] = false;
                event.preventDefault();
            } else if (event.key === 'Shift') {
                this.keys.shift = false;
                event.preventDefault();
            }
        });

        // Reset keys when window loses focus
        window.addEventListener('blur', () => {
            for (let key in this.keys) {
                this.keys[key] = false;
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

        // Clear all movement keys when pausing
        if (this.isPaused) {
            for (let key in this.keys) {
                this.keys[key] = false;
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
    // Kept for backwards compatibility but does nothing
    updatePauseUI() {
        // Pause UI is now handled by React PauseMenu component
        // This method is kept for backwards compatibility
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
        
        // Fall back to keyboard input
        const direction = new Vector2D(0, 0);
        
        if (this.keys.w) direction.z += 1;
        if (this.keys.s) direction.z -= 1;
        if (this.keys.a) direction.x += 1;
        if (this.keys.d) direction.x -= 1;
        
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
        const keyboardMoving = this.keys.w || this.keys.a || this.keys.s || this.keys.d;
        
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
        const keyboardSprinting = this.keys.shift;
        
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
}
