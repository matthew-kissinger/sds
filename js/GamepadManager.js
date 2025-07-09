import { Vector2D } from './Vector2D.js';

/**
 * GamepadManager - Robust gamepad input handling for desktop users
 * Follows modern game development architecture with proper deadzone handling
 */
export class GamepadManager {
    constructor() {
        this.gamepad = null;
        this.connected = false;
        this.previousButtons = [];
        this.deadzone = 0.15; // Configurable deadzone for analog sticks
        this.triggerThreshold = 0.1; // Threshold for trigger activation
        
        // Button mappings (standard gamepad layout)
        this.buttonMap = {
            A: 0,        // A button - Zoom In
            B: 1,        // B button - Zoom Out
            X: 2,        // X button (unused)
            Y: 3,        // Y button (unused)
            LB: 4,       // Left bumper (unused)
            RB: 5,       // Right bumper (unused)
            LT: 6,       // Left trigger (unused)
            RT: 7,       // Right trigger (unused - using axis instead)
            SELECT: 8,   // Select/Back button (unused)
            START: 9,    // Start/Menu button - Pause
            LS: 10,      // Left stick button (unused)
            RS: 11,      // Right stick button (unused)
            DPAD_UP: 12,    // D-pad up (unused)
            DPAD_DOWN: 13,  // D-pad down (unused)
            DPAD_LEFT: 14,  // D-pad left (unused)
            DPAD_RIGHT: 15  // D-pad right (unused)
        };
        
        // Axis mappings
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
        
        this.setupGamepadEvents();
        console.log('🎮 GamepadManager initialized');
    }
    
    /**
     * Set up gamepad connection/disconnection event listeners
     */
    setupGamepadEvents() {
        window.addEventListener('gamepadconnected', (event) => {
            this.onGamepadConnected(event);
        });
        
        window.addEventListener('gamepaddisconnected', (event) => {
            this.onGamepadDisconnected(event);
        });
    }
    
    /**
     * Handle gamepad connection
     */
    onGamepadConnected(event) {
        this.gamepad = event.gamepad;
        this.connected = true;
        this.connectionState = 'connected';
        this.previousButtons = new Array(this.gamepad.buttons.length).fill(false);
        
        console.log('🎮 Gamepad connected:', {
            id: event.gamepad.id,
            buttons: event.gamepad.buttons.length,
            axes: event.gamepad.axes.length
        });
        
        // Show connection notification
        this.showConnectionNotification(true);
    }
    
    /**
     * Handle gamepad disconnection
     */
    onGamepadDisconnected(event) {
        this.connected = false;
        this.connectionState = 'disconnected';
        this.gamepad = null;
        
        console.log('🎮 Gamepad disconnected:', event.gamepad.id);
        
        // Show disconnection notification
        this.showConnectionNotification(false);
    }
    
    /**
     * Update gamepad state - should be called every frame
     */
    update() {
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
                    console.log('🎮 Gamepad detected:', this.gamepad.id);
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
            console.log('🎮 Gamepad connection lost');
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
        if (!this.connected || !this.gamepad) {
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
        if (!this.connected || !this.gamepad) {
            return false;
        }
        
        // Check right trigger axis (most common)
        if (this.gamepad.axes[this.axisMap.RT_AXIS] !== undefined) {
            return this.gamepad.axes[this.axisMap.RT_AXIS] > this.triggerThreshold;
        }
        
        // Fallback to right trigger button
        if (this.gamepad.buttons[this.buttonMap.RT]) {
            return this.gamepad.buttons[this.buttonMap.RT].pressed;
        }
        
        return false;
    }
    
    /**
     * Check if zoom in button is pressed (A button)
     */
    isZoomInPressed() {
        if (!this.connected || !this.gamepad) {
            return false;
        }
        
        return this.gamepad.buttons[this.buttonMap.A]?.pressed || false;
    }
    
    /**
     * Check if zoom out button is pressed (B button)
     */
    isZoomOutPressed() {
        if (!this.connected || !this.gamepad) {
            return false;
        }
        
        return this.gamepad.buttons[this.buttonMap.B]?.pressed || false;
    }
    
    /**
     * Check if pause button was just pressed (Start button - edge detection)
     */
    isPausePressed() {
        if (!this.connected || !this.gamepad) {
            return false;
        }
        
        const currentState = this.gamepad.buttons[this.buttonMap.START]?.pressed || false;
        const previousState = this.previousButtons[this.buttonMap.START] || false;
        
        // Return true only on button press (not hold)
        return currentState && !previousState;
    }
    
    /**
     * Get current button state for debugging
     */
    getButtonState(buttonName) {
        if (!this.connected || !this.gamepad || !this.buttonMap[buttonName]) {
            return false;
        }
        
        return this.gamepad.buttons[this.buttonMap[buttonName]]?.pressed || false;
    }
    
    /**
     * Get current axis value for debugging
     */
    getAxisValue(axisName) {
        if (!this.connected || !this.gamepad || this.axisMap[axisName] === undefined) {
            return 0;
        }
        
        return this.gamepad.axes[this.axisMap[axisName]] || 0;
    }
    
    /**
     * Set deadzone value
     */
    setDeadzone(deadzone) {
        this.deadzone = Math.max(0, Math.min(1, deadzone));
        console.log('🎮 Gamepad deadzone set to:', this.deadzone);
    }
    
    /**
     * Show gamepad connection notification
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
            🎮 Gamepad ${connected ? 'Connected' : 'Disconnected'}
            ${connected ? '<br><small>Use left stick to move, right trigger to sprint</small>' : ''}
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
