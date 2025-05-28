import { Vector2D } from './Vector2D.js';

/**
 * Enhanced input handler for both keyboard and mobile touch controls
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
        
        // Show/hide pause indicator
        this.updatePauseUI();
    }

    // Register a callback to be called when pause state changes
    onPauseToggle(callback) {
        this.pauseCallbacks.push(callback);
    }

    // Update pause UI indicator
    updatePauseUI() {
        let pauseIndicator = document.getElementById('pause-indicator');
        
        if (this.isPaused) {
            if (!pauseIndicator) {
                pauseIndicator = document.createElement('div');
                pauseIndicator.id = 'pause-indicator';
                
                // Different pause message for mobile vs desktop
                const isMobile = this.mobileControls && this.mobileControls.getIsTouchDevice();
                const pauseMessage = isMobile ? 
                    '⏸️ PAUSED<br><small>Tap to resume</small>' : 
                    '⏸️ PAUSED<br><small>Press ESC to resume</small>';
                
                pauseIndicator.innerHTML = pauseMessage;
                pauseIndicator.style.cssText = `
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 20px;
                    border-radius: 10px;
                    font-size: 24px;
                    text-align: center;
                    z-index: 1000;
                    font-family: Arial, sans-serif;
                `;
                
                // Add touch event for mobile resume
                if (isMobile) {
                    pauseIndicator.addEventListener('touchstart', (e) => {
                        e.preventDefault();
                        this.togglePause();
                    });
                }
                
                document.body.appendChild(pauseIndicator);
            }
            pauseIndicator.style.display = 'block';
        } else {
            if (pauseIndicator) {
                pauseIndicator.style.display = 'none';
            }
        }
    }

    // Get movement direction based on current input state (keyboard + mobile)
    getMovementDirection() {
        // Return zero movement if paused
        if (this.isPaused) {
            return new Vector2D(0, 0);
        }
        
        // Start with keyboard input
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
        
        // Check keyboard input
        const keyboardMoving = this.keys.w || this.keys.a || this.keys.s || this.keys.d;
        
        // Check mobile input
        const mobileMoving = this.mobileControls && 
                            this.mobileControls.getIsTouchDevice() && 
                            this.mobileControls.getIsMoving();
        
        return keyboardMoving || mobileMoving;
    }
    
    // Check if sprint input is active (keyboard shift or mobile sprint button)
    isSprinting() {
        // Return false if paused
        if (this.isPaused) {
            return false;
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
} 