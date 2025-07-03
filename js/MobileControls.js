import { Vector2D } from './Vector2D.js';

/**
 * MobileControls - Bridge for mobile device touch controls and fullscreen management
 * All mobile UI components now handled by React MobileHUD system
 */
export class MobileControls {
    constructor(sceneManager, audioManager) {
        this.sceneManager = sceneManager;
        this.audioManager = audioManager;
        this.isTouchDevice = this.detectTouchDevice();
        this.isEnabled = false;
        this.movementVector = new Vector2D(0, 0);
        this.isMoving = false;
        this.isSprinting = false; // Bridge for React MobileHUD
        this.onZoomChange = null; // Bridge for React MobileHUD zoom callback
        
        // UI elements (fullscreen banner only)
        this.fullscreenButton = null;
        this.persistentFullscreenButton = null;
        
        if (this.isTouchDevice) {
            this.createFullscreenButton();
            this.setupFullscreenListeners();
            this.createMobileUI();
            this.setupTouchPrevention();
            
            // Add fullscreen change listeners that trigger resize
            if (this.sceneManager) {
                ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'msfullscreenchange']
                    .forEach(evt => document.addEventListener(evt, () => this.sceneManager.onWindowResize()));
            }
            
            // For testing - create persistent button after a delay if not in fullscreen
            setTimeout(() => {
                if (!this.isFullscreen() && !this.persistentFullscreenButton) {
                    console.log('🔍 Creating persistent fullscreen button for testing');
                    this.createPersistentFullscreenButton();
                }
            }, 3000);
        }
    }
    
    /**
     * Detect if device supports touch input
     * @returns {boolean} True if touch device detected
     */
    detectTouchDevice() {
        // Multiple detection methods for better accuracy
        const hasTouch = 'ontouchstart' in window || 
                        navigator.maxTouchPoints > 0 || 
                        navigator.msMaxTouchPoints > 0;
        
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        const hasCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        
        const isSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 768;
        
        // Device is considered touch-capable if it has touch AND (is mobile OR has coarse pointer OR small screen)
        return hasTouch && (isMobile || hasCoarsePointer || isSmallScreen);
    }
    

    
    /**
     * Create mobile UI elements
     */
    createMobileUI() {
        // All mobile UI now handled by React MobileHUD
        this.updateMobileInstructions();
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
        // All controls now handled by React MobileHUD
    }
    
    /**
     * Disable mobile controls
     */
    disable() {
        this.isEnabled = false;
        // All controls now handled by React MobileHUD
        
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
     * Note: Sprint state now managed by React MobileHUD
     */
    getIsSprinting() {
        return this.isEnabled && this.isSprinting;
    }
    
    /**
     * Set zoom change callback
     * Note: Zoom control now managed by React MobileHUD
     */
    setZoomChangeCallback(callback) {
        this.onZoomChange = callback; // Store callback for React MobileHUD to use
    }
    
    /**
     * Get current zoom level
     * Note: Zoom control now managed by React MobileHUD
     */
    getZoomLevel() {
        return 80; // Default zoom level
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
        // All controls now handled by React MobileHUD - no cleanup needed
        this.hidePersistentFullscreenButton();
    }
    
    /**
     * Check if fullscreen API is supported
     */
    isFullscreenSupported() {
        const element = document.documentElement;
        return !!(
            element.requestFullscreen ||
            element.webkitRequestFullscreen ||
            element.webkitRequestFullScreen ||
            element.mozRequestFullScreen ||
            element.msRequestFullscreen
        );
    }
    
    /**
     * Create fullscreen button for mobile devices
     */
    createFullscreenButton() {
        // Only show on mobile devices that support fullscreen
        if (!this.isTouchDevice || !this.isFullscreenSupported()) return;
        
        // Don't create if already exists or if already in fullscreen
        if (this.fullscreenButton || this.isFullscreen()) return;
        
        // Create simple, reliable fullscreen banner
        this.fullscreenButton = document.createElement('div');
        this.fullscreenButton.id = 'mobile-fullscreen-banner';
        this.fullscreenButton.innerHTML = `
            <div class="banner-content">
                <span class="banner-icon">📱</span>
                <span class="banner-text">Tap for better experience</span>
            </div>
        `;
        
        // Simple, reliable styling
        this.fullscreenButton.style.cssText = `
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 1rem);
            left: 50%;
            transform: translateX(-50%);
            z-index: 1001;
            
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 1rem;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            
            padding: 0.75rem 1rem;
            color: white;
            font-family: Arial, sans-serif;
            font-size: 0.9rem;
            font-weight: bold;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
            
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            
            transition: all 0.3s ease;
            animation: bannerSlideIn 0.5s ease-out;
        `;
        
        // Add banner animation CSS
        if (!document.getElementById('banner-animations')) {
            const style = document.createElement('style');
            style.id = 'banner-animations';
            style.textContent = `
                @keyframes bannerSlideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0);
                    }
                }
                
                #mobile-fullscreen-banner .banner-content {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }
                
                #mobile-fullscreen-banner .banner-icon {
                    font-size: 1.1rem;
                }
                
                #mobile-fullscreen-banner:active {
                    transform: translateX(-50%) scale(0.98);
                    background: rgba(0, 191, 255, 0.2);
                }
            `;
            document.head.appendChild(style);
        }
        
        // Simple click handler - just request fullscreen
        this.fullscreenButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.requestFullscreen();
            this.hideFullscreenButton();
        });
        
        // Prevent context menu
        this.fullscreenButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Auto-hide after 8 seconds for better user experience
        this.fullscreenTimeout = setTimeout(() => {
            this.hideFullscreenButton();
        }, 8000);
        
        document.body.appendChild(this.fullscreenButton);
    }
    
    /**
     * Request fullscreen with cross-browser compatibility
     */
    requestFullscreen() {
        console.log('🔍 requestFullscreen called');
        const element = document.documentElement;
        
        try {
            let fullscreenPromise = null;
            
            // Check for different fullscreen API methods
            if (element.requestFullscreen) {
                console.log('🔍 Using element.requestFullscreen()');
                fullscreenPromise = element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) {
                console.log('🔍 Using element.webkitRequestFullscreen()');
                fullscreenPromise = element.webkitRequestFullscreen();
            } else if (element.webkitRequestFullScreen) {
                console.log('🔍 Using element.webkitRequestFullScreen()');
                fullscreenPromise = element.webkitRequestFullScreen();
            } else if (element.mozRequestFullScreen) {
                console.log('🔍 Using element.mozRequestFullScreen()');
                fullscreenPromise = element.mozRequestFullScreen();
            } else if (element.msRequestFullscreen) {
                console.log('🔍 Using element.msRequestFullscreen()');
                fullscreenPromise = element.msRequestFullscreen();
            } else {
                console.warn('🔍 Fullscreen API not supported on this device');
                // Hide button anyway since user tried to use it
                this.hideFullscreenButton();
                return;
            }
            
            // Handle the fullscreen promise
            if (fullscreenPromise && fullscreenPromise.then) {
                console.log('🔍 Fullscreen promise available, handling success/failure');
                fullscreenPromise.then(() => {
                    console.log('🔍 Fullscreen request successful!');
                    /* 1. Force a layout pass for the new viewport and update controls layout */
                    setTimeout(() => {
                        window.dispatchEvent(new Event('resize'));
                        this.updateFullscreenLayout(); // Ensure layout is updated after resize
                    }, 50);
                    
                    /* 2. If start-screen is still active, scroll it back in view */
                    if (document.getElementById('start-screen')) {
                        document.getElementById('start-screen').scrollIntoView({block:'center'});
                    }
                    
                    /* 3. Guarantee AudioContext is resumed */
                    if (this.audioManager && this.audioManager.listener && this.audioManager.listener.context && 
                        this.audioManager.listener.context.state === 'suspended') {
                        this.audioManager.listener.context.resume().catch(() => {});
                    }
                }).catch((error) => {
                    console.error('🔍 Fullscreen request failed:', error);
                });
            } else {
                console.log('🔍 No fullscreen promise (might be older browser)');
            }
            
            // Hide the fullscreen button after requesting fullscreen
            this.hideFullscreenButton();
            
        } catch (error) {
            console.error('🔍 Exception during fullscreen request:', error);
            // Hide button if fullscreen fails
            this.hideFullscreenButton();
        }
    }
    
    /**
     * Hide the fullscreen button
     */
    hideFullscreenButton() {
        // Clear any pending timeout to prevent random pop-ups
        if (this.fullscreenTimeout) {
            clearTimeout(this.fullscreenTimeout);
            this.fullscreenTimeout = null;
        }
        
        if (this.fullscreenButton) {
            // Smooth fade out animation
            this.fullscreenButton.style.opacity = '0';
            this.fullscreenButton.style.transform = 'translateX(-50%) translateY(-20px)';
            this.fullscreenButton.style.pointerEvents = 'none';
            
            setTimeout(() => {
                if (this.fullscreenButton) {
                    this.fullscreenButton.remove();
                    this.fullscreenButton = null;
                }
                
                // Show persistent fullscreen option after banner disappears
                if (!this.isFullscreen()) {
                    this.createPersistentFullscreenButton();
                }
            }, 300);
        }
    }
    
    /**
     * Create a small persistent fullscreen button
     */
    createPersistentFullscreenButton() {
        // Don't create if already exists or if already in fullscreen
        if (this.persistentFullscreenButton || this.isFullscreen()) {
            console.log('🔍 Not creating persistent fullscreen button - already exists or in fullscreen');
            return;
        }
        
        console.log('🔍 Creating persistent fullscreen button');
        this.persistentFullscreenButton = document.createElement('button');
        this.persistentFullscreenButton.id = 'persistent-fullscreen-btn';
        this.persistentFullscreenButton.innerHTML = '⛶';
        this.persistentFullscreenButton.title = 'Fullscreen';
        
        this.persistentFullscreenButton.style.cssText = `
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 1rem);
            right: calc(env(safe-area-inset-right, 0px) + 1rem);
            width: 44px;
            height: 44px;
            border-radius: 0.75rem;
            z-index: 2000;
            
            background: rgba(0, 191, 255, 0.15);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 2px solid rgba(0, 191, 255, 0.3);
            box-shadow: 0 4px 16px rgba(0, 191, 255, 0.2);
            
            color: white;
            font-size: 18px;
            font-family: Arial, sans-serif;
            font-weight: bold;
            
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            
            transition: all 0.2s ease;
            opacity: 0.9;
            pointer-events: auto;
            
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // Hover/active effects
        this.persistentFullscreenButton.addEventListener('mouseenter', () => {
            this.persistentFullscreenButton.style.opacity = '1';
            this.persistentFullscreenButton.style.background = 'rgba(0, 191, 255, 0.25)';
            this.persistentFullscreenButton.style.transform = 'scale(1.05)';
        });
        
        this.persistentFullscreenButton.addEventListener('mouseleave', () => {
            this.persistentFullscreenButton.style.opacity = '0.9';
            this.persistentFullscreenButton.style.background = 'rgba(0, 191, 255, 0.15)';
            this.persistentFullscreenButton.style.transform = 'scale(1)';
        });
        
        this.persistentFullscreenButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            console.log('🔍 Persistent fullscreen button touchstart');
            this.persistentFullscreenButton.style.transform = 'scale(0.9)';
            this.persistentFullscreenButton.style.opacity = '1';
            this.persistentFullscreenButton.style.background = 'rgba(0, 191, 255, 0.3)';
        });
        
        this.persistentFullscreenButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            console.log('🔍 Persistent fullscreen button touchend - requesting fullscreen');
            this.persistentFullscreenButton.style.transform = 'scale(1)';
            this.requestFullscreen();
            this.hidePersistentFullscreenButton();
        });
        
        this.persistentFullscreenButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🔍 Persistent fullscreen button click - requesting fullscreen');
            this.requestFullscreen();
            this.hidePersistentFullscreenButton();
        });
        
        // Prevent context menu
        this.persistentFullscreenButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        document.body.appendChild(this.persistentFullscreenButton);
        console.log('🔍 Persistent fullscreen button added to DOM', this.persistentFullscreenButton);
        
        // Button is already visible with 0.9 opacity - no need for fade-in delay
    }
    
    /**
     * Hide the persistent fullscreen button
     */
    hidePersistentFullscreenButton() {
        if (this.persistentFullscreenButton) {
            this.persistentFullscreenButton.style.opacity = '0';
            this.persistentFullscreenButton.style.transform = 'scale(0.8)';
            this.persistentFullscreenButton.style.pointerEvents = 'none';
            
            setTimeout(() => {
                if (this.persistentFullscreenButton) {
                    this.persistentFullscreenButton.remove();
                    this.persistentFullscreenButton = null;
                }
            }, 200);
        }
    }
    
    /**
     * Check if device is in fullscreen mode
     */
    isFullscreen() {
        return !!(
            document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.mozFullScreenElement ||
            document.msFullscreenElement
        );
    }
    
    /**
     * Setup fullscreen change event listeners
     */
    setupFullscreenListeners() {
        // Handle fullscreen change events across different browsers
        const handleFullscreenChange = () => {
            // Update mobile UI positioning for fullscreen
            this.updateFullscreenLayout();
            
            // Show persistent button when exiting fullscreen on mobile
            if (!this.isFullscreen() && this.isTouchDevice) {
                console.log('🔍 Exited fullscreen on mobile device');
                setTimeout(() => {
                    // Double-check user hasn't gone back to fullscreen
                    if (!this.isFullscreen() && !this.fullscreenButton && !this.persistentFullscreenButton) {
                        console.log('🔍 Creating persistent fullscreen button after delay');
                        this.createPersistentFullscreenButton();
                    } else {
                        console.log('🔍 Not creating button - conditions not met');
                    }
                }, 1000);
            } else {
                // Entering fullscreen - hide persistent button
                console.log('🔍 Entering fullscreen - hiding persistent button');
                this.hidePersistentFullscreenButton();
            }
        };
        
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);
    }
    
    /**
     * Update mobile UI layout for fullscreen mode
     */
    updateFullscreenLayout() {
        if (!this.isTouchDevice) return;
        
        const isFullscreen = this.isFullscreen();
        const body = document.body;
        
        if (isFullscreen) {
            // Add fullscreen class for CSS targeting
            body.classList.add('mobile-fullscreen');
            
            // In the new container system, individual positioning is handled by CSS
            // We only need to ensure elements are not overridden by JS
            
            // Clear any JS-forced positioning for stamina bar in landscape fullscreen
            // Let the CSS container system handle it
            if (window.matchMedia('(orientation: landscape)').matches) {
                const staminaBar = document.getElementById('stamina-bar');
                if (staminaBar) {
                    // Clear JS positioning - let CSS containers handle it
                    staminaBar.style.left = '';
                    staminaBar.style.transform = '';
                    staminaBar.style.right = '';
                    staminaBar.style.bottom = '';
                }
            }
        } else {
            // Remove fullscreen class
            body.classList.remove('mobile-fullscreen');
            
            // Reset any positioning when exiting fullscreen if needed
            // But mostly let CSS handle it
        }
    }
}