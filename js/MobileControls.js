// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { Vector2D } from './Vector2D.js';
import { Z } from './ui/zIndex.js';

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
        
        // UI elements (fullscreen button only)
        this.fullscreenButton = null;
        this.persistentFullscreenButton = null;
        
        // Free-mode camera controller (set by main after construction).
        // Two-finger drag deltas drive applyYawDelta when this is wired.
        this.cameraController = null;
        this._twoFingerLastX = null;

        if (this.isTouchDevice) {
            this.createFullscreenButton();
            this.setupFullscreenListeners();
            this.createMobileUI();
            this.setupTouchPrevention();
            this.setupCameraTouchControls();

            // Add fullscreen change listeners that trigger resize
            if (this.sceneManager) {
                ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'msfullscreenchange']
                    .forEach(evt => document.addEventListener(evt, () => this.sceneManager.onWindowResize()));
            }
        }
    }

    setCameraController(controller) {
        this.cameraController = controller;
    }

    /**
     * Two-finger horizontal pan on the canvas → camera yaw delta. Single-finger
     * touches are reserved for the existing virtual joystick.
     */
    setupCameraTouchControls() {
        const canvas = document.querySelector('canvas');
        if (!canvas) return;

        const onStart = (e) => {
            if (e.touches.length === 2) {
                this._twoFingerLastX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            } else {
                this._twoFingerLastX = null;
            }
        };

        const onMove = (e) => {
            if (e.touches.length !== 2 || !this.cameraController || this._twoFingerLastX === null) return;
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const delta = midX - this._twoFingerLastX;
            this._twoFingerLastX = midX;
            this.cameraController.applyYawDelta(delta * this.cameraController.touchYawScale);
        };

        const onEnd = (e) => {
            if (e.touches.length < 2) this._twoFingerLastX = null;
        };

        canvas.addEventListener('touchstart', onStart, { passive: true });
        canvas.addEventListener('touchmove', onMove, { passive: true });
        canvas.addEventListener('touchend', onEnd, { passive: true });
        canvas.addEventListener('touchcancel', onEnd, { passive: true });
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
     * Check if this is an iOS device
     */
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
               (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    }

    /**
     * Create fullscreen button for mobile devices
     */
    createFullscreenButton() {
        // Don't create if already exists or if already in fullscreen
        if (this.fullscreenButton || this.isFullscreen()) return;

        // Only show on mobile devices that support fullscreen (skip iOS entirely)
        if (!this.isTouchDevice || !this.isFullscreenSupported()) return;

        // Create simple, reliable fullscreen button
        this.fullscreenButton = document.createElement('button');
        this.fullscreenButton.type = 'button';
        this.fullscreenButton.id = 'mobile-fullscreen-button';
        this.fullscreenButton.setAttribute('aria-label', 'Enter fullscreen');
        this.fullscreenButton.title = 'Enter fullscreen';
        this.fullscreenButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.95;">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                <path d="M21 8V5a2 2 0 0 0-2-2h-3"></path>
                <path d="M3 16v3a2 2 0 0 0 2 2h3"></path>
                <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
            </svg>
        `;
        
        // Simple, reliable styling
        this.fullscreenButton.style.cssText = `
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
            left: calc(env(safe-area-inset-left, 0px) + 0.75rem);
            z-index: ${Z.controls};
            width: 44px;
            height: 44px;
            
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(43, 38, 32, 0.58);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border: 1px solid rgba(246, 239, 224, 0.22);
            border-radius: 12px;
            box-shadow: 0 8px 22px rgba(0, 0, 0, 0.18);
            
            padding: 0;
            color: white;
            font-family: Arial, sans-serif;
            
            cursor: pointer;
            user-select: none;
            -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent;
            
            transition: all 0.3s ease;
            animation: fullscreenButtonIn 0.35s ease-out;
        `;
        
        // Add button animation CSS
        if (!document.getElementById('banner-animations')) {
            const style = document.createElement('style');
            style.id = 'banner-animations';
            style.textContent = `
                @keyframes fullscreenButtonIn {
                    from {
                        opacity: 0;
                        transform: translateY(-8px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                #mobile-fullscreen-button:active {
                    transform: scale(0.96);
                    background: rgba(246, 239, 224, 0.18);
                }
            `;
            document.head.appendChild(style);
        }
        
        // Click handler - request fullscreen
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

        // Auto-hide after 12 seconds for better user experience
        this.fullscreenTimeout = setTimeout(() => {
            this.hideFullscreenButton();
        }, 12000);
        
        document.body.appendChild(this.fullscreenButton);
    }
    
    /**
     * Request fullscreen with cross-browser compatibility
     */
    requestFullscreen() {
        console.log('[MOBILE] requestFullscreen called');
        const element = document.documentElement;
        
        try {
            let fullscreenPromise = null;
            
            // Check for different fullscreen API methods
            if (element.requestFullscreen) {
                console.log('[MOBILE] Using element.requestFullscreen()');
                fullscreenPromise = element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) {
                console.log('[MOBILE] Using element.webkitRequestFullscreen()');
                fullscreenPromise = element.webkitRequestFullscreen();
            } else if (element.webkitRequestFullScreen) {
                console.log('[MOBILE] Using element.webkitRequestFullScreen()');
                fullscreenPromise = element.webkitRequestFullScreen();
            } else if (element.mozRequestFullScreen) {
                console.log('[MOBILE] Using element.mozRequestFullScreen()');
                fullscreenPromise = element.mozRequestFullScreen();
            } else if (element.msRequestFullscreen) {
                console.log('[MOBILE] Using element.msRequestFullscreen()');
                fullscreenPromise = element.msRequestFullscreen();
            } else {
                console.warn('[MOBILE] Fullscreen API not supported on this device');
                // Hide button anyway since user tried to use it
                this.hideFullscreenButton();
                return;
            }
            
            // Handle the fullscreen promise
            if (fullscreenPromise && fullscreenPromise.then) {
                console.log('[MOBILE] Fullscreen promise available, handling success/failure');
                fullscreenPromise.then(() => {
                    console.log('[MOBILE] Fullscreen request successful!');
                    /* 1. Force a layout pass for the new viewport and update controls layout */
                    setTimeout(() => {
                        window.dispatchEvent(new Event('resize'));
                        this.updateFullscreenLayout(); // Ensure layout is updated after resize
                    }, 50);
                    
                    /* 2. Guarantee AudioContext is resumed */
                    if (this.audioManager && this.audioManager.listener && this.audioManager.listener.context && 
                        this.audioManager.listener.context.state === 'suspended') {
                        this.audioManager.listener.context.resume().catch(() => {});
                    }
                }).catch((error) => {
                    console.error('[MOBILE] Fullscreen request failed:', error);
                });
            } else {
                console.log('[MOBILE] No fullscreen promise (might be older browser)');
            }
            
            // Hide the fullscreen button after requesting fullscreen
            this.hideFullscreenButton();
            
        } catch (error) {
            console.error('[MOBILE] Exception during fullscreen request:', error);
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
            this.fullscreenButton.style.transform = 'translateY(-8px)';
            this.fullscreenButton.style.pointerEvents = 'none';
            
            setTimeout(() => {
                if (this.fullscreenButton) {
                    this.fullscreenButton.remove();
                    this.fullscreenButton = null;
                }

                // Removed: No longer showing persistent button after initial banner dismissal
                // Per TASKLIST Phase 1.3: "Remove auto-appearing persistent button after 3 seconds"
                // Fullscreen option is available in pause menu and shows when exiting fullscreen
            }, 300);
        }
    }
    
    /**
     * Create a small persistent fullscreen button
     */
    createPersistentFullscreenButton() {
        // Don't create if already exists or if already in fullscreen
        if (this.persistentFullscreenButton || this.isFullscreen()) {
            console.log('[MOBILE] Not creating persistent fullscreen button - already exists or in fullscreen');
            return;
        }
        
        console.log('[MOBILE] Creating persistent fullscreen button');
        this.persistentFullscreenButton = document.createElement('button');
        this.persistentFullscreenButton.id = 'persistent-fullscreen-btn';
        this.persistentFullscreenButton.innerHTML = '⛶';
        this.persistentFullscreenButton.title = 'Fullscreen';
        
        this.persistentFullscreenButton.style.cssText = `
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 5rem);
            right: calc(env(safe-area-inset-right, 0px) + 1rem);
            width: 44px;
            height: 44px;
            border-radius: 0.75rem;
            z-index: ${Z.controls};
            
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
            console.log('[MOBILE] Persistent fullscreen button touchstart');
            this.persistentFullscreenButton.style.transform = 'scale(0.9)';
            this.persistentFullscreenButton.style.opacity = '1';
            this.persistentFullscreenButton.style.background = 'rgba(0, 191, 255, 0.3)';
        });
        
        this.persistentFullscreenButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            console.log('[MOBILE] Persistent fullscreen button touchend - requesting fullscreen');
            this.persistentFullscreenButton.style.transform = 'scale(1)';
            this.requestFullscreen();
            this.hidePersistentFullscreenButton();
        });
        
        this.persistentFullscreenButton.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[MOBILE] Persistent fullscreen button click - requesting fullscreen');
            this.requestFullscreen();
            this.hidePersistentFullscreenButton();
        });
        
        // Prevent context menu
        this.persistentFullscreenButton.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        document.body.appendChild(this.persistentFullscreenButton);
        console.log('[MOBILE] Persistent fullscreen button added to DOM', this.persistentFullscreenButton);
        
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
                console.log('[MOBILE] Exited fullscreen on mobile device');
                setTimeout(() => {
                    // Double-check user hasn't gone back to fullscreen
                    if (!this.isFullscreen() && !this.fullscreenButton && !this.persistentFullscreenButton) {
                        console.log('[MOBILE] Creating persistent fullscreen button after delay');
                        this.createPersistentFullscreenButton();
                    } else {
                        console.log('[MOBILE] Not creating button - conditions not met');
                    }
                }, 1000);
            } else {
                // Entering fullscreen - hide persistent button
                console.log('[MOBILE] Entering fullscreen - hiding persistent button');
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
