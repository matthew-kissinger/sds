import { Vector2D } from './Vector2D.js';

/**
 * MobileControls - Handles touch-based input controls for mobile devices
 * Includes virtual joystick for movement and zoom slider for camera control
 */
export class MobileControls {
    constructor() {
        this.isTouchDevice = this.detectTouchDevice();
        this.isEnabled = false;
        this.joystick = null;
        this.zoomSlider = null;
        this.movementVector = new Vector2D(0, 0);
        this.isMoving = false;
        this.isSprinting = false;
        this.zoomLevel = 80; // Default camera distance
        this.onZoomChange = null;
        
        // UI elements
        this.joystickContainer = null;
        this.zoomContainer = null;
        this.sprintButton = null;
        
        if (this.isTouchDevice) {
            this.loadNippleJS().then(() => {
                this.createMobileUI();
                this.setupTouchPrevention();
            });
        }
    }
    
    /**
     * Detect if device supports touch
     */
    detectTouchDevice() {
        return ('ontouchstart' in window) || 
               (navigator.maxTouchPoints > 0) || 
               (navigator.msMaxTouchPoints > 0);
    }
    
    /**
     * Load nipple.js library dynamically
     */
    async loadNippleJS() {
        return new Promise((resolve, reject) => {
            if (window.nipplejs) {
                resolve();
                return;
            }
            
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/nipplejs/0.10.2/nipplejs.js';
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load nipple.js'));
            document.head.appendChild(script);
        });
    }
    
    /**
     * Create mobile UI elements
     */
    createMobileUI() {
        this.createJoystick();
        this.createZoomSlider();
        this.createSprintButton();
        this.updateMobileInstructions();
    }
    
    /**
     * Create virtual joystick for movement
     */
    createJoystick() {
        // Create joystick container
        this.joystickContainer = document.createElement('div');
        this.joystickContainer.id = 'mobile-joystick';
        this.joystickContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            width: 120px;
            height: 120px;
            z-index: 1001;
            display: none;
            pointer-events: auto;
        `;
        document.body.appendChild(this.joystickContainer);
        
        // Initialize nipple.js joystick
        if (window.nipplejs) {
            this.joystick = window.nipplejs.create({
                zone: this.joystickContainer,
                mode: 'static',
                position: { left: '50%', top: '50%' },
                color: '#00BFFF',
                size: 120,
                threshold: 0.1,
                fadeTime: 250,
                restOpacity: 0.7
            });
            
            // Handle joystick events
            this.joystick.on('start', () => {
                this.isMoving = true;
            });
            
            this.joystick.on('move', (evt, data) => {
                if (data.vector) {
                    // Convert joystick vector to movement vector
                    // Nipple.js uses screen coordinates, we need game coordinates
                    this.movementVector.x = -data.vector.x; // Invert X for correct direction
                    this.movementVector.z = data.vector.y;  // Y becomes Z in 3D space
                    this.isMoving = true;
                }
            });
            
            this.joystick.on('end', () => {
                this.movementVector.x = 0;
                this.movementVector.z = 0;
                this.isMoving = false;
            });
        }
    }
    
    /**
     * Create zoom slider for camera control
     */
    createZoomSlider() {
        this.zoomContainer = document.createElement('div');
        this.zoomContainer.id = 'mobile-zoom';
        this.zoomContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 40px;
            height: 200px;
            z-index: 1001;
            display: none;
            pointer-events: auto;
        `;
        
        // Create slider
        this.zoomSlider = document.createElement('input');
        this.zoomSlider.type = 'range';
        this.zoomSlider.min = '20';
        this.zoomSlider.max = '150';
        this.zoomSlider.value = '80';
        this.zoomSlider.orient = 'vertical';
        this.zoomSlider.style.cssText = `
            width: 200px;
            height: 40px;
            transform: rotate(-90deg) translateX(-80px);
            transform-origin: 20px 20px;
            background: rgba(255, 255, 255, 0.9);
            border-radius: 20px;
            outline: none;
            -webkit-appearance: none;
            appearance: none;
        `;
        
        // Style the slider track and thumb
        const style = document.createElement('style');
        style.textContent = `
            #mobile-zoom input[type="range"]::-webkit-slider-track {
                height: 8px;
                background: #ddd;
                border-radius: 4px;
                border: 1px solid #00BFFF;
            }
            
            #mobile-zoom input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                height: 20px;
                width: 20px;
                border-radius: 50%;
                background: #00BFFF;
                cursor: pointer;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            
            #mobile-zoom input[type="range"]::-moz-range-track {
                height: 8px;
                background: #ddd;
                border-radius: 4px;
                border: 1px solid #00BFFF;
            }
            
            #mobile-zoom input[type="range"]::-moz-range-thumb {
                height: 20px;
                width: 20px;
                border-radius: 50%;
                background: #00BFFF;
                cursor: pointer;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
        `;
        document.head.appendChild(style);
        
        // Add zoom labels
        const zoomLabel = document.createElement('div');
        zoomLabel.textContent = 'Zoom';
        zoomLabel.style.cssText = `
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
            font-size: 12px;
            color: white;
            background: rgba(0, 0, 0, 0.7);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-weight: bold;
        `;
        
        this.zoomContainer.appendChild(zoomLabel);
        this.zoomContainer.appendChild(this.zoomSlider);
        document.body.appendChild(this.zoomContainer);
        
        // Handle zoom changes
        this.zoomSlider.addEventListener('input', (e) => {
            this.zoomLevel = parseInt(e.target.value);
            if (this.onZoomChange) {
                this.onZoomChange(this.zoomLevel);
            }
        });
    }
    
    /**
     * Create sprint button
     */
    createSprintButton() {
        this.sprintButton = document.createElement('button');
        this.sprintButton.id = 'mobile-sprint';
        this.sprintButton.textContent = '🏃';
        this.sprintButton.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 80px;
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: rgba(0, 191, 255, 0.8);
            border: 3px solid white;
            color: white;
            font-size: 24px;
            z-index: 1001;
            display: none;
            pointer-events: auto;
            box-shadow: 0 4px 8px rgba(0,0,0,0.3);
            transition: all 0.2s ease;
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
        `;
        
        // Handle sprint button events
        this.sprintButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.isSprinting = true;
            this.sprintButton.style.background = 'rgba(255, 107, 53, 0.9)';
            this.sprintButton.style.transform = 'scale(0.95)';
        });
        
        this.sprintButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isSprinting = false;
            this.sprintButton.style.background = 'rgba(0, 191, 255, 0.8)';
            this.sprintButton.style.transform = 'scale(1)';
        });
        
        // Prevent context menu
        this.sprintButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        document.body.appendChild(this.sprintButton);
    }
    
    /**
     * Update instructions for mobile devices
     */
    updateMobileInstructions() {
        const instructions = document.getElementById('instructions');
        if (instructions && this.isTouchDevice) {
            // Hide the instructions completely on mobile
            instructions.style.display = 'none';
        }
    }
    
    /**
     * Setup touch event prevention for game canvas
     */
    setupTouchPrevention() {
        const canvas = document.querySelector('canvas');
        if (canvas) {
            // Prevent default touch behaviors on canvas
            canvas.addEventListener('touchstart', (e) => {
                e.preventDefault();
            }, { passive: false });
            
            canvas.addEventListener('touchmove', (e) => {
                e.preventDefault();
            }, { passive: false });
            
            canvas.addEventListener('touchend', (e) => {
                e.preventDefault();
            }, { passive: false });
        }
        
        // Prevent zoom on double tap
        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Prevent zoom on pinch
        document.addEventListener('gesturestart', (e) => {
            e.preventDefault();
        });
    }
    
    /**
     * Enable mobile controls
     */
    enable() {
        if (!this.isTouchDevice) return;
        
        this.isEnabled = true;
        if (this.joystickContainer) this.joystickContainer.style.display = 'block';
        if (this.zoomContainer) this.zoomContainer.style.display = 'block';
        if (this.sprintButton) this.sprintButton.style.display = 'block';
    }
    
    /**
     * Disable mobile controls
     */
    disable() {
        this.isEnabled = false;
        if (this.joystickContainer) this.joystickContainer.style.display = 'none';
        if (this.zoomContainer) this.zoomContainer.style.display = 'none';
        if (this.sprintButton) this.sprintButton.style.display = 'none';
        
        // Reset movement state
        this.movementVector.x = 0;
        this.movementVector.z = 0;
        this.isMoving = false;
        this.isSprinting = false;
    }
    
    /**
     * Get current movement direction
     */
    getMovementDirection() {
        if (!this.isEnabled) return new Vector2D(0, 0);
        return this.movementVector.clone();
    }
    
    /**
     * Check if currently moving
     */
    getIsMoving() {
        return this.isEnabled && this.isMoving;
    }
    
    /**
     * Check if currently sprinting
     */
    getIsSprinting() {
        return this.isEnabled && this.isSprinting;
    }
    
    /**
     * Set zoom change callback
     */
    setZoomChangeCallback(callback) {
        this.onZoomChange = callback;
    }
    
    /**
     * Get current zoom level
     */
    getZoomLevel() {
        return this.zoomLevel;
    }
    
    /**
     * Check if this is a touch device
     */
    getIsTouchDevice() {
        return this.isTouchDevice;
    }
    
    /**
     * Cleanup mobile controls
     */
    destroy() {
        if (this.joystick) {
            this.joystick.destroy();
        }
        
        if (this.joystickContainer) {
            this.joystickContainer.remove();
        }
        
        if (this.zoomContainer) {
            this.zoomContainer.remove();
        }
        
        if (this.sprintButton) {
            this.sprintButton.remove();
        }
    }
} 