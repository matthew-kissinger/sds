import { Vector2D } from './Vector2D.js';

/**
 * LocalInputHandler - Handles dual input for local 2-player mode
 * Player 1: WASD + Left Shift (sprint)
 * Player 2: Arrow Keys + Right Shift (sprint)
 */
export class LocalInputHandler {
    constructor() {
        // Player 1 keys (WASD)
        this.player1Keys = {
            w: false,
            a: false,
            s: false,
            d: false,
            shift: false // Left Shift
        };

        // Player 2 keys (Arrow Keys)
        this.player2Keys = {
            up: false,
            left: false,
            down: false,
            right: false,
            shift: false // Right Shift
        };

        this.isPaused = false;
        this.pauseCallbacks = [];

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Keydown event
        window.addEventListener('keydown', (event) => {
            // Handle pause toggle with Escape key
            if (event.key === 'Escape') {
                this.togglePause();
                event.preventDefault();
                return;
            }

            // Skip if typing in text field
            if (window.isTypingInInput) {
                return;
            }

            // Only process if not paused
            if (this.isPaused) {
                event.preventDefault();
                return;
            }

            // Player 1 controls (WASD)
            const key = event.key.toLowerCase();
            if (key === 'w') {
                this.player1Keys.w = true;
                event.preventDefault();
            } else if (key === 'a') {
                this.player1Keys.a = true;
                event.preventDefault();
            } else if (key === 's') {
                this.player1Keys.s = true;
                event.preventDefault();
            } else if (key === 'd') {
                this.player1Keys.d = true;
                event.preventDefault();
            }

            // Player 1 sprint (Left Shift) - use event.code for cross-browser reliability
            if (event.code === 'ShiftLeft') {
                this.player1Keys.shift = true;
                event.preventDefault();
            }

            // Player 2 controls (Arrow Keys)
            if (event.key === 'ArrowUp') {
                this.player2Keys.up = true;
                event.preventDefault();
            } else if (event.key === 'ArrowLeft') {
                this.player2Keys.left = true;
                event.preventDefault();
            } else if (event.key === 'ArrowDown') {
                this.player2Keys.down = true;
                event.preventDefault();
            } else if (event.key === 'ArrowRight') {
                this.player2Keys.right = true;
                event.preventDefault();
            }

            // Player 2 sprint (Right Shift) - use event.code for cross-browser reliability
            if (event.code === 'ShiftRight') {
                this.player2Keys.shift = true;
                event.preventDefault();
            }
        });

        // Keyup event
        window.addEventListener('keyup', (event) => {
            // Don't process if paused
            if (this.isPaused) {
                event.preventDefault();
                return;
            }

            // Player 1 controls (WASD)
            const key = event.key.toLowerCase();
            if (key === 'w') {
                this.player1Keys.w = false;
                event.preventDefault();
            } else if (key === 'a') {
                this.player1Keys.a = false;
                event.preventDefault();
            } else if (key === 's') {
                this.player1Keys.s = false;
                event.preventDefault();
            } else if (key === 'd') {
                this.player1Keys.d = false;
                event.preventDefault();
            }

            // Player 1 sprint (Left Shift)
            if (event.code === 'ShiftLeft') {
                this.player1Keys.shift = false;
                event.preventDefault();
            }

            // Player 2 controls (Arrow Keys)
            if (event.key === 'ArrowUp') {
                this.player2Keys.up = false;
                event.preventDefault();
            } else if (event.key === 'ArrowLeft') {
                this.player2Keys.left = false;
                event.preventDefault();
            } else if (event.key === 'ArrowDown') {
                this.player2Keys.down = false;
                event.preventDefault();
            } else if (event.key === 'ArrowRight') {
                this.player2Keys.right = false;
                event.preventDefault();
            }

            // Player 2 sprint (Right Shift)
            if (event.code === 'ShiftRight') {
                this.player2Keys.shift = false;
                event.preventDefault();
            }
        });

        // Reset keys when window loses focus
        window.addEventListener('blur', () => {
            this.resetAllKeys();
        });
    }

    resetAllKeys() {
        for (let key in this.player1Keys) {
            this.player1Keys[key] = false;
        }
        for (let key in this.player2Keys) {
            this.player2Keys[key] = false;
        }
    }

    togglePause() {
        this.isPaused = !this.isPaused;

        if (this.isPaused) {
            this.resetAllKeys();
        }

        // Notify callbacks
        this.pauseCallbacks.forEach(callback => callback(this.isPaused));

        // Dispatch custom event for React PauseMenu
        window.dispatchEvent(new CustomEvent('game-pause-change', {
            detail: { isPaused: this.isPaused }
        }));
    }

    onPauseToggle(callback) {
        this.pauseCallbacks.push(callback);
    }

    // Legacy updatePauseUI - now handled by React PauseMenu component
    updatePauseUI() {
        // Pause UI is now handled by React PauseMenu component
    }

    // Get Player 1 movement direction (WASD)
    getPlayer1Direction() {
        if (this.isPaused) {
            return new Vector2D(0, 0);
        }

        const direction = new Vector2D(0, 0);

        if (this.player1Keys.w) direction.z += 1;
        if (this.player1Keys.s) direction.z -= 1;
        if (this.player1Keys.a) direction.x += 1;
        if (this.player1Keys.d) direction.x -= 1;

        return direction;
    }

    // Get Player 2 movement direction (Arrow Keys)
    getPlayer2Direction() {
        if (this.isPaused) {
            return new Vector2D(0, 0);
        }

        const direction = new Vector2D(0, 0);

        if (this.player2Keys.up) direction.z += 1;
        if (this.player2Keys.down) direction.z -= 1;
        if (this.player2Keys.left) direction.x += 1;
        if (this.player2Keys.right) direction.x -= 1;

        return direction;
    }

    // Check if Player 1 is moving
    isPlayer1Moving() {
        return this.player1Keys.w || this.player1Keys.a || this.player1Keys.s || this.player1Keys.d;
    }

    // Check if Player 2 is moving
    isPlayer2Moving() {
        return this.player2Keys.up || this.player2Keys.left || this.player2Keys.down || this.player2Keys.right;
    }

    // Check if Player 1 is sprinting
    isPlayer1Sprinting() {
        if (this.isPaused) return false;
        return this.player1Keys.shift;
    }

    // Check if Player 2 is sprinting
    isPlayer2Sprinting() {
        if (this.isPaused) return false;
        return this.player2Keys.shift;
    }

    // Check if game is paused
    isPausedState() {
        return this.isPaused;
    }

    // Cleanup
    destroy() {
        this.resetAllKeys();
        this.pauseCallbacks = [];
    }
}
