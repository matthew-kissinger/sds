// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { CameraController } from './CameraController.js';
import { detectTier } from './HardwareTier.js';
import { initGlProbe, captureContext, captureFramebufferSample, captureWaterSample } from './diagnostics/glProbe.js';
import { configureProductionRenderer, createProductionWebGLRenderer } from './rendering/sceneRendererSetup.js';

/**
 * SceneManager - Three.js scene/lighting/renderer lifecycle plus competitive
 * player-color logic. Camera state lives in CameraController; this class
 * exposes thin pass-throughs (setCameraDistance, transformMovementForCompetitive,
 * etc.) so existing callers don't need to know about the split.
 */
export class SceneManager {
    constructor(options = {}) {
        this.scene = new THREE.Scene();
        
        // Mobile-optimized camera parameters to prevent clipping
        this.isMobile = this.detectMobileDevice();
        const near = this.isMobile ? 2.0 : 0.1;    // 20x safer near plane for mobile
        // Far plane sized for the extended terrain plane
        // (4000m desktop / 3200m mobile, diagonals ~2828m / ~2263m). Camera at
        // max-zoom Classic offset adds another ~150m of slant distance to the
        // far corner. The atmosphere skybox stays glued to the far plane in its
        // shader, so this also controls how far the visible sky reaches.
        // Earlier values: 1000/500 (Cycle 3) → 2800/1800 (Cycle 4 Hardening,
        // with 2400/1600 plane) → 4500/3700 (plane grew to push edge into fog).
        const far = this.isMobile ? 3700 : 4500;
        
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            near, 
            far
        );
        
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        // Cycle 10 Phase 3: opt-in cinematic mode. ?cinematic=1 enables
        // preserveDrawingBuffer so canvas.toDataURL() returns non-blank
        // frames for Playwright-driven filming. Off by default — the flag
        // is documented to have a perf hit on the normal-play codepath, so
        // we strictly gate it.
        const isCinematic = typeof location !== 'undefined' &&
            new URLSearchParams(location.search).get('cinematic') === '1';

        const createRenderer = options.createRenderer ?? createProductionWebGLRenderer;
        const configureRenderer = options.configureRenderer ?? configureProductionRenderer;
        this.renderer = createRenderer({ isIOS, isCinematic });
        this.renderStatus = {
            mode: typeof this.renderer.renderAsync === 'function' ? 'async' : 'sync',
            inFlight: false,
            rendererReady: typeof this.renderer.renderAsync !== 'function',
            rendererReadyError: null,
            lastError: null,
        };
        this._renderAsyncInFlight = null;

        const toneOverride = (typeof location !== 'undefined' &&
            new URLSearchParams(location.search).get('tonemap')) || null;
        this.rendererSetup = configureRenderer(this.renderer, {
            width: window.innerWidth,
            height: window.innerHeight,
            isMobile: this.isMobile,
            devicePixelRatio: window.devicePixelRatio,
            toneOverride,
            platform: navigator.platform,
            userAgent: navigator.userAgent,
        });

        // Cycle 23 Phase D1: classify hardware tier once per session.
        // Drives per-tier presets in GrassSystem (clumps, blade count, fade)
        // and is available to other subsystems via SceneManager.getTier().
        const debugForceTier = (typeof location !== 'undefined' &&
            new URLSearchParams(location.search).get('tier')) || null;
        this.tier = detectTier(this.renderer, {
            isMobile: this.isMobile,
            debugForceTier: ['low','med','high'].includes(debugForceTier) ? debugForceTier : undefined,
        });
        console.log(`[TIER] Hardware tier detected: ${this.tier}${debugForceTier ? ' (forced via ?tier=)' : ''}`);
        console.log('[WEBGL] isIOS:', isIOS);
        
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        this.rendererReady = this.createRendererReadyPromise(options.rendererReady);

        // Cycle 9 Phase 4: capture WebGL context info into window.__sdsDiag
        // when ?debug=gl is set. macOS Safari smoke harvests this.
        initGlProbe();
        captureContext(this.renderer);
        // Expose a deterministic on-demand sampler so the Safari smoke (and
        // a human in devtools) can capture exactly when needed instead of
        // relying on a 240-frame counter that drifts when rAF is throttled.
        // Usage in devtools: `window.__sdsCaptureSample('inGame')`.
        if (typeof window !== 'undefined') {
            const renderer = this.renderer;
            window.__sdsCaptureSample = (label = 'manual') => {
                try {
                    captureFramebufferSample(renderer, label);
                    captureWaterSample(renderer, label);
                    return {
                        framebufferSample: window.__sdsDiag?.framebufferSample ?? null,
                        waterSample: window.__sdsDiag?.waterSample ?? null,
                    };
                } catch (err) {
                    return { error: String(err?.message || err) };
                }
            };
        }
        
        // Camera state owned by CameraController; SceneManager provides
        // thin pass-throughs (setCameraDistance / transformMovementForCompetitive /
        // updateCamera, etc.) for back-compat with existing call sites.
        this.cameraController = new CameraController(this.camera, { isMobile: this.isMobile });
        this.mobileControls = null;
        this.gamepadManager = null;
        
        // Player color system
        this.playerColors = new Map(); // playerId -> color
        this.competitivePlayerColors = [
            0xFF0000, // Red
            0x0000FF, // Blue  
            0x00FF00, // Green
            0xFFFF00  // Yellow
        ];
        this.coloredMeshes = new Map(); // playerId -> array of meshes with applied colors
        
        this.init();

        console.log(`[CAMERA] Initialized for ${this.isMobile ? 'MOBILE' : 'DESKTOP'} device`);
        console.log(`[CAMERA] Parameters: near=${this.camera.near}, far=${this.camera.far}, minDistance=${this.cameraController.minDistance}`);
    }

    getCameraController() {
        return this.cameraController;
    }

    /**
     * Cycle 23 Phase D1: hardware tier set once at construction, immutable
     * for the session. Subsystems read via this getter to dial presets.
     * @returns {'low'|'med'|'high'}
     */
    getTier() {
        return this.tier ?? (this.isMobile ? 'low' : 'med');
    }

    /**
     * Detect if the current device is mobile for camera optimization
     * @returns {boolean} True if mobile device detected
     */
    detectMobileDevice() {
        const userAgent = navigator.userAgent;
        const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
        const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        const isSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 768;
        
        return isMobileUA || (hasTouch && isSmallScreen);
    }
    
    init() {
        // Set scene background
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 200, 600); // Extended fog for larger world
        
        // Setup camera - adjusted for larger field (default position for solo/cooperative mode)
        this.camera.position.set(0, 60, -60);
        this.camera.lookAt(0, 0, 0);
        
        // Add lighting
        this.setupLighting();
        
        // Handle window resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    setupLighting() {
        // Cycle 72 P3: the WebGPU renderer (three.webgpu) cannot bind lights
        // created from the WebGL `three` instance this module imports - they log
        // "THREE.LightsNode.setupNodeLights: Light node not found" every frame and
        // contribute nothing to shading. The konveyor production boot installs its
        // own webgpu-three lighting bridge for standard materials, and the node
        // materials are self-lit from atmosphere uniforms, so these WebGL-three
        // lights are pure warning spam on WebGPU. Create the ambient light (so
        // Atmosphere can still bind to it) but only add the rig on WebGL. Zero
        // render change on WebGPU (these lights never bound there).
        const isWebGpu = typeof this.renderer?.renderAsync === 'function';

        // Ambient light - adjusted for new lighting model (multiply by PI for similar appearance)
        // Stored on `this` so the Atmosphere module can bind to it and modulate
        // intensity / color from the active sky preset.
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7 * Math.PI);
        if (isWebGpu) return; // WebGL-three lights only warn on the WebGPU path
        this.scene.add(this.ambientLight);
        
        // Directional light (sun) - adjusted for new lighting model
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8 * Math.PI);
        directionalLight.position.set(30, 70, 30);
        
        // Only enable shadows on desktop
        if (!this.isMobile) {
            directionalLight.castShadow = true;
            
            // Shadow configuration - adjusted for larger field
            directionalLight.shadow.camera.left = -120;
            directionalLight.shadow.camera.right = 120;
            directionalLight.shadow.camera.top = 120;
            directionalLight.shadow.camera.bottom = -120;
            directionalLight.shadow.camera.near = 1;
            directionalLight.shadow.camera.far = 150;
            directionalLight.shadow.mapSize.width = 2048;
            directionalLight.shadow.mapSize.height = 2048;
        }
        
        this.scene.add(directionalLight);
        
        // Add a subtle secondary light for better depth - adjusted for new lighting model
        const secondaryLight = new THREE.DirectionalLight(0xffd4a3, 0.3 * Math.PI);
        secondaryLight.position.set(-50, 40, -50);
        this.scene.add(secondaryLight);
    }
    
    updateCamera(sheepdog, deltaTime = 1 / 60) {
        if (!sheepdog) return;
        // Cycle 13 cinema: __sdsCinema.freeFly() suspends gameplay camera
        // so OrbitControls can pose the camera for hero-shot framing while
        // the simulation keeps running (sheep stay mid-flock).
        if (typeof window !== 'undefined' && window.__sdsCinema?.freeFlyActive) return;
        this.cameraController.update(sheepdog.position, sheepdog.velocity, deltaTime, {
            isSprinting: !!sheepdog.isSprinting,
        });
    }

    setMobileControls(mobileControls) {
        this.mobileControls = mobileControls;

        if (mobileControls) {
            mobileControls.setZoomChangeCallback((zoomLevel) => {
                this.cameraController.setZoom(zoomLevel);
            });
        }
    }

    setGamepadManager(gamepadManager) {
        this.gamepadManager = gamepadManager;
    }

    setupMouseControls() {
        // Mouse wheel for zoom (desktop only). Mobile zoom is owned by the
        // React MobileHUD slider which calls setCameraZoom directly.
        this.renderer.domElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            if (this.mobileControls && this.mobileControls.getIsTouchDevice()) return;
            this.cameraController.handleWheel(event.deltaY);
        });
    }

    handleGamepadZoom() {
        if (!this.gamepadManager || !this.gamepadManager.isConnected()) return;
        this.cameraController.handleGamepadZoom({
            zoomIn: this.gamepadManager.isZoomInPressed(),
            zoomOut: this.gamepadManager.isZoomOutPressed()
        });
    }

    getCameraDistance() {
        return this.cameraController.getZoom();
    }

    setCameraDistance(distance) {
        this.cameraController.setZoom(distance);
    }

    setCameraZoom(zoomLevel) {
        this.cameraController.setZoom(zoomLevel);
    }

    // Legacy alias used by debug logging in main.js. Reads from controller.
    get competitiveCameraDirection() {
        return this.cameraController.getCompetitiveDirection();
    }
    
    /**
     * Cycle 5+: optionally bind anime water for island scenes.
     *
     * @param {{mesh: import('three').Mesh, water: {mesh: import('three').Mesh, update: (t: number, sun?: import('three').Vector3) => void, resize: (w?: number, h?: number) => void, dispose: () => void}}} bundle
     */
    setWater(bundle) {
        this.waterBundle = bundle || null;
    }

    /**
     * Tear down the active water bundle.
     */
    disposeWater() {
        if (!this.waterBundle) return;
        const bundle = this.waterBundle;
        try {
            if (bundle.mesh && bundle.mesh.parent) bundle.mesh.parent.remove(bundle.mesh);
            bundle.water?.dispose?.();
        } catch (err) {
            console.warn('[SCENE] disposeWater threw:', err);
        }
        this.waterBundle = null;
    }

    createRendererReadyPromise(rendererReady = null) {
        if (rendererReady) {
            return Promise.resolve(rendererReady)
                .then(() => {
                    this.renderStatus.rendererReady = true;
                    return true;
                })
                .catch((err) => {
                    this.renderStatus.rendererReady = false;
                    this.renderStatus.rendererReadyError = String(err?.message || err);
                    console.error('[RENDER] renderer initialization failed:', err);
                    return false;
                });
        }

        if (this.renderStatus.mode !== 'async' || typeof this.renderer.init !== 'function') {
            this.renderStatus.rendererReady = true;
            return Promise.resolve(true);
        }

        return this.renderer.init()
            .then(() => {
                this.renderStatus.rendererReady = true;
                return true;
            })
            .catch((err) => {
                this.renderStatus.rendererReady = false;
                this.renderStatus.rendererReadyError = String(err?.message || err);
                console.error('[RENDER] renderer initialization failed:', err);
                return false;
            });
    }

    whenRendererReady() {
        return this.rendererReady ?? Promise.resolve(true);
    }

    async renderAsyncFrame() {
        const ready = await this.whenRendererReady();
        if (!ready) return false;
        try {
            await this.renderer.renderAsync(this.scene, this.camera);
            this.renderStatus.lastError = null;
            return true;
        } catch (err) {
            this.renderStatus.lastError = String(err?.message || err);
            console.error('[RENDER] async render failed:', err);
            return false;
        }
    }

    render() {
        if (typeof this.renderer.renderAsync === 'function') {
            if (this._renderAsyncInFlight) return this._renderAsyncInFlight;
            this.renderStatus.inFlight = true;
            this._renderAsyncInFlight = this.renderAsyncFrame()
                .finally(() => {
                    this.renderStatus.inFlight = false;
                    this._renderAsyncInFlight = null;
                });
            return this._renderAsyncInFlight;
        }

        this.renderer.render(this.scene, this.camera);
        this.renderStatus.lastError = null;
        return true;
    }

    getRenderStatus() {
        return { ...this.renderStatus };
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.waterBundle) {
            this.waterBundle.water.resize();
        }
    }
    
    add(object) {
        this.scene.add(object);
    }
    
    remove(object) {
        this.scene.remove(object);
    }
    
    getScene() {
        return this.scene;
    }
    
    getCamera() {
        return this.camera;
    }
    
    getRenderer() {
        return this.renderer;
    }
    
    /**
     * Initialize player colors for competitive mode
     * @param {Array} playerIds - Array of player IDs
     * @param {Array} gateColors - Optional array of colors from gate configuration
     */
    initializePlayerColors(playerIds, gateColors = null) {
        console.log(`[SCENE] Initializing player colors for ${playerIds.length} players`);
        
        this.playerColors.clear();
        
        playerIds.forEach((playerId, index) => {
            let playerColor;
            
            if (gateColors && gateColors[index] !== undefined) {
                // Use colors from gate configuration if provided
                playerColor = gateColors[index];
            } else {
                // Use default competitive colors
                playerColor = this.competitivePlayerColors[index % this.competitivePlayerColors.length];
            }
            
            this.playerColors.set(playerId, playerColor);
            console.log(`Player ${playerId} assigned color: 0x${playerColor.toString(16).toUpperCase()}`);
        });
    }
    
    /**
     * Get player color
     * @param {string} playerId - Player ID
     * @returns {number} - Color as hex number
     */
    getPlayerColor(playerId) {
        return this.playerColors.get(playerId) || 0x888888; // Default gray
    }
    
    /**
     * Apply player color to sheepdog mesh
     * @param {string} playerId - Player ID  
     * @param {THREE.Mesh} sheepdog - Sheepdog mesh or object with mesh property
     */
    applyPlayerColorToSheepdog(playerId, sheepdog) {
        const playerColor = this.getPlayerColor(playerId);
        
        if (!playerColor) {
            console.warn(`No color found for player ${playerId}`);
            return;
        }
        
        // Get the actual mesh object
        const mesh = sheepdog.mesh || sheepdog;
        
        if (!mesh || !mesh.material) {
            console.warn(`Invalid mesh for player ${playerId}`);
            return;
        }
        
        // Store original materials if not already stored
        if (!mesh.userData.originalMaterials) {
            if (Array.isArray(mesh.material)) {
                mesh.userData.originalMaterials = mesh.material.map(mat => mat.clone());
            } else {
                mesh.userData.originalMaterials = mesh.material.clone();
            }
        }
        
        // Apply player color as tint to materials
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach((material, index) => {
                if (material.color) {
                    // Blend original color with player color (20% player color, 80% original)
                    const originalColor = mesh.userData.originalMaterials[index].color;
                    material.color.setHex(this.blendColors(originalColor.getHex(), playerColor, 0.2));
                    
                    // Add slight emissive glow in player color
                    if (material.emissive) {
                        material.emissive.setHex(playerColor);
                        material.emissiveIntensity = 0.05;
                    }
                }
            });
        } else {
            if (mesh.material.color) {
                // Blend original color with player color
                const originalColor = mesh.userData.originalMaterials.color;
                mesh.material.color.setHex(this.blendColors(originalColor.getHex(), playerColor, 0.2));
                
                // Add slight emissive glow in player color
                if (mesh.material.emissive) {
                    mesh.material.emissive.setHex(playerColor);
                    mesh.material.emissiveIntensity = 0.05;
                }
            }
        }
        
        // Track this mesh for cleanup
        if (!this.coloredMeshes.has(playerId)) {
            this.coloredMeshes.set(playerId, []);
        }
        this.coloredMeshes.get(playerId).push(mesh);
        
        console.log(`Applied color 0x${playerColor.toString(16).toUpperCase()} to player ${playerId}'s sheepdog`);
    }
    
    /**
     * Remove player color from sheepdog (restore original materials)
     * @param {string} playerId - Player ID
     */
    removePlayerColor(playerId) {
        const meshes = this.coloredMeshes.get(playerId);
        
        if (!meshes) return;
        
        meshes.forEach(mesh => {
            if (mesh.userData.originalMaterials) {
                mesh.material = mesh.userData.originalMaterials;
                delete mesh.userData.originalMaterials;
            }
        });
        
        this.coloredMeshes.delete(playerId);
        console.log(`Removed color for player ${playerId}`);
    }
    
    /**
     * Clear all player colors
     */
    clearAllPlayerColors() {
        for (const playerId of this.coloredMeshes.keys()) {
            this.removePlayerColor(playerId);
        }
        this.playerColors.clear();
        console.log('[SCENE] Cleared all player colors');
    }
    
    /**
     * Blend two colors
     * @param {number} color1 - First color as hex number
     * @param {number} color2 - Second color as hex number  
     * @param {number} ratio - Blend ratio (0-1, where 0 = color1, 1 = color2)
     * @returns {number} - Blended color as hex number
     */
    blendColors(color1, color2, ratio) {
        const r1 = (color1 >> 16) & 0xff;
        const g1 = (color1 >> 8) & 0xff;
        const b1 = color1 & 0xff;
        
        const r2 = (color2 >> 16) & 0xff;
        const g2 = (color2 >> 8) & 0xff;
        const b2 = color2 & 0xff;
        
        const r = Math.round(r1 * (1 - ratio) + r2 * ratio);
        const g = Math.round(g1 * (1 - ratio) + g2 * ratio);
        const b = Math.round(b1 * (1 - ratio) + b2 * ratio);
        
        return (r << 16) | (g << 8) | b;
    }
    
    /**
     * Get all assigned player colors
     * @returns {Map} - Map of playerId to color
     */
    getPlayerColors() {
        return new Map(this.playerColors);
    }
    
    setCompetitiveCameraPosition(playerGate) {
        this.cameraController.setCompetitiveCameraPosition(playerGate);
    }

    resetCameraToDefault() {
        this.cameraController.resetCameraToDefault();
    }

    transformMovementForCompetitive(movementDirection) {
        return this.cameraController.transformMovement(movementDirection);
    }
}
