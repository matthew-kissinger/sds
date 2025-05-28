import { Vector2D } from './Vector2D.js';

/**
 * Input handler for keyboard controls
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
                pauseIndicator.innerHTML = '⏸️ PAUSED<br><small>Press ESC to resume</small>';
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
                document.body.appendChild(pauseIndicator);
            }
            pauseIndicator.style.display = 'block';
        } else {
            if (pauseIndicator) {
                pauseIndicator.style.display = 'none';
            }
        }
    }

    // Get movement direction based on current key states
    getMovementDirection() {
        // Return zero movement if paused
        if (this.isPaused) {
            return new Vector2D(0, 0);
        }
        
        const direction = new Vector2D(0, 0);
        
        if (this.keys.w) direction.z += 1;
        if (this.keys.s) direction.z -= 1;
        if (this.keys.a) direction.x += 1;
        if (this.keys.d) direction.x -= 1;
        
        return direction;
    }

    // Check if any movement key is pressed
    isMoving() {
        // Return false if paused
        if (this.isPaused) {
            return false;
        }
        
        return this.keys.w || this.keys.a || this.keys.s || this.keys.d;
    }
    
    // Check if sprint key (shift) is pressed
    isSprinting() {
        // Return false if paused
        if (this.isPaused) {
            return false;
        }
        
        return this.keys.shift;
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