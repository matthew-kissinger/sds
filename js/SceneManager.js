import * as THREE from 'three';
import { CameraController } from './CameraController.js';
import { detectTier } from './HardwareTier.js';
import { initGlProbe, captureContext, captureFramebufferSample } from './diagnostics/glProbe.js';

/**
 * SceneManager - Three.js scene/lighting/renderer lifecycle plus competitive
 * player-color logic. Camera state lives in CameraController; this class
 * exposes thin pass-throughs (setCameraDistance, transformMovementForCompetitive,
 * etc.) so existing callers don't need to know about the split.
 */
export class SceneManager {
    constructor() {
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
        
        // iOS-safe WebGL renderer settings
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        // Cycle 10 Phase 3: opt-in cinematic mode. ?cinematic=1 enables
        // preserveDrawingBuffer so canvas.toDataURL() returns non-blank
        // frames for Playwright-driven filming. Off by default — the flag
        // is documented to have a perf hit on the normal-play codepath, so
        // we strictly gate it.
        const isCinematic = typeof location !== 'undefined' &&
            new URLSearchParams(location.search).get('cinematic') === '1';

        this.renderer = new THREE.WebGLRenderer({
            antialias: !isIOS, // Disable antialiasing on iOS (known issues)
            powerPreference: "high-performance",
            stencil: false,
            alpha: false, // Opaque canvas for better performance
            preserveDrawingBuffer: isCinematic,
            failIfMajorPerformanceCaveat: false // Don't fail on software rendering
        });

        // Enable shader error checking for debugging
        this.renderer.debug.checkShaderErrors = true;

        this.renderer.setSize(window.innerWidth, window.innerHeight);

        // Log WebGL info for debugging
        const gl = this.renderer.getContext();
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            console.log('[WEBGL] Vendor:', gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL));
            console.log('[WEBGL] Renderer:', gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL));
        }
        console.log('[WEBGL] Version:', gl.getParameter(gl.VERSION));
        console.log('[WEBGL] Max Vertex Uniforms:', gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS));

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

        console.log('[WEBGL] Max Fragment Uniforms:', gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS));
        console.log('[WEBGL] Max Texture Size:', gl.getParameter(gl.MAX_TEXTURE_SIZE));
        console.log('[WEBGL] isIOS:', isIOS);

        // Handle WebGL context loss
        this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
            console.error('[WEBGL] Context lost!', event);
            event.preventDefault();
        });

        this.renderer.domElement.addEventListener('webglcontextrestored', () => {
            console.log('[WEBGL] Context restored');
        });

        // Disable shadows on mobile for performance
        if (this.isMobile) {
            this.renderer.shadowMap.enabled = false;
            console.log('[PERF] Shadows disabled on mobile for performance');
        } else {
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        }
        
        // Performance optimizations
        // Force devicePixelRatio to 1 on mobile, otherwise limit to 2
        if (this.isMobile) {
            this.renderer.setPixelRatio(1);
            console.log('[PERF] Mobile detected: forcing devicePixelRatio to 1');
        } else {
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        }
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // The Hosek-Wilkie sky shader (and its preset exposure values 0.18-0.22)
        // assumes the renderer is tonemapping HDR radiance down. Without
        // tonemapping the shader output ends up near-black. ACES Filmic is the
        // de-facto-standard pick; it brightens midtones and rolls off highlights.
        //
        // Apple caveat: ACES pushes cool blues (sky-blue fog 0x87CEEB at distance)
        // toward white on Apple Metal-ANGLE + extended-sRGB display output, so
        // the foggy horizon reads as a near-white wash. v2.0.3 covered Mac;
        // v2.0.4 extends to iPhone/iPad after Matt observed the same wash on
        // iPhone water (foam + sun-glint terms, same Metal-ANGLE pipeline).
        // Neutral (Khronos PBR Neutral, r162+) preserves color identity through
        // the same dynamic range, fixing the wash without affecting non-Apple
        // platforms. Override with ?tonemap=aces|neutral|linear|none for A/B.
        const toneOverride = (typeof location !== 'undefined' &&
            new URLSearchParams(location.search).get('tonemap')) || null;
        const isApplePlatform = typeof navigator !== 'undefined' &&
            /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
        let chosenToneMapping;
        if (toneOverride === 'aces') chosenToneMapping = THREE.ACESFilmicToneMapping;
        else if (toneOverride === 'neutral') chosenToneMapping = THREE.NeutralToneMapping;
        else if (toneOverride === 'linear') chosenToneMapping = THREE.LinearToneMapping;
        else if (toneOverride === 'none') chosenToneMapping = THREE.NoToneMapping;
        else chosenToneMapping = isApplePlatform ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
        this.renderer.toneMapping = chosenToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        const toneName = chosenToneMapping === THREE.NeutralToneMapping ? 'Neutral'
            : chosenToneMapping === THREE.ACESFilmicToneMapping ? 'ACESFilmic'
            : chosenToneMapping === THREE.LinearToneMapping ? 'Linear'
            : 'None';
        console.log(`[TONEMAP] ${isApplePlatform ? 'Apple' : 'non-Apple'} platform — ${toneName}${toneOverride ? ` (override=${toneOverride})` : ''}`);

        // Enable frustum culling and other optimizations
        this.renderer.sortObjects = true;
        this.renderer.autoClear = true;
        
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);

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
                    return window.__sdsDiag?.framebufferSample ?? null;
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
        // Ambient light - adjusted for new lighting model (multiply by PI for similar appearance)
        // Stored on `this` so the Atmosphere module can bind to it and modulate
        // intensity / color from the active sky preset.
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.7 * Math.PI);
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
     * Cycle 5+: optionally bind an anime water + depth pre-pass.
     * When set, render() runs the depth pre-pass (with water hidden) before
     * the main render so the water shader can sample scene depth for
     * shoreline foam.
     *
     * @param {{mesh: import('three').Mesh, depthPrePass: import('./water/DepthPrePass.js').DepthPrePass, water: {mesh: import('three').Mesh, update: (t: number, sun?: import('three').Vector3) => void, resize: (w: number, h: number) => void, dispose: () => void}}} bundle
     */
    setWater(bundle) {
        this.waterBundle = bundle || null;
    }

    /**
     * Tear down the active water bundle (Cycle 11 Phase 1). Disposes the
     * depth pre-pass render target first to release the depth-stencil
     * texture before atmosphere disposal — the dispose-order coupling is
     * the Mac/Safari WebGL crash class flagged in cycle-11-plan.md.
     */
    disposeWater() {
        if (!this.waterBundle) return;
        const bundle = this.waterBundle;
        try {
            if (bundle.mesh && bundle.mesh.parent) bundle.mesh.parent.remove(bundle.mesh);
            bundle.water?.dispose?.();
            bundle.depthPrePass?.dispose?.();
        } catch (err) {
            console.warn('[SCENE] disposeWater threw:', err);
        }
        this.waterBundle = null;
    }

    render() {
        const water = this.waterBundle;
        if (water && water.depthPrePass && water.mesh) {
            // Render scene-without-water into the depth target
            water.mesh.visible = false;
            water.depthPrePass.render();
            water.mesh.visible = true;
        }
        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        if (this.waterBundle) {
            this.waterBundle.depthPrePass.resize();
            const dpr = this.renderer.getDrawingBufferSize(new THREE.Vector2());
            this.waterBundle.water.resize(dpr.x, dpr.y);
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
