import * as THREE from 'three';
import { Vector2D } from './Vector2D.js';

/**
 * SceneManager - Handles Three.js scene setup, lighting, and camera management
 * Enhanced with mobile zoom control support
 */
export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();
        
        // Mobile-optimized camera parameters to prevent clipping
        this.isMobile = this.detectMobileDevice();
        const near = this.isMobile ? 2.0 : 0.1;    // 20x safer near plane for mobile
        const far = this.isMobile ? 500 : 1000;    // Better precision ratio for mobile
        
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            near, 
            far
        );
        
        // iOS-safe WebGL renderer settings
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

        this.renderer = new THREE.WebGLRenderer({
            antialias: !isIOS, // Disable antialiasing on iOS (known issues)
            powerPreference: "high-performance",
            stencil: false,
            alpha: false, // Opaque canvas for better performance
            preserveDrawingBuffer: false,
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
        
        // Enable frustum culling and other optimizations
        this.renderer.sortObjects = true;
        this.renderer.autoClear = true;
        
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        
        // Camera control with mobile-optimized distances
        this.cameraDistance = 80;
        this.minCameraDistance = this.isMobile ? 35 : 20;  // Safer minimum for mobile
        this.maxCameraDistance = 150;
        this.mobileControls = null;
        this.gamepadManager = null;
        this.competitiveCameraDirection = null; // Store competitive gate direction for camera positioning
        
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
        
        // Log mobile camera optimization status
        console.log(`[CAMERA] Initialized for ${this.isMobile ? 'MOBILE' : 'DESKTOP'} device`);
        console.log(`[CAMERA] Parameters: near=${this.camera.near}, far=${this.camera.far}, minDistance=${this.minCameraDistance}`);
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7 * Math.PI);
        this.scene.add(ambientLight);
        
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
    
    updateCamera(sheepdog) {
        // Update camera to follow sheepdog - adjusted for dynamic zoom
        let cameraOffset;
        
        // Use competitive camera offset if we have a stored competitive direction
        if (this.competitiveCameraDirection) {
            cameraOffset = this.getCompetitiveCameraOffset();
        } else {
            // Default camera offset for solo/cooperative mode
            cameraOffset = new THREE.Vector3(0, this.cameraDistance, -this.cameraDistance);
        }
        
        const targetPosition = new THREE.Vector3(
            sheepdog.position.x,
            0,
            sheepdog.position.z
        );
        
        this.camera.position.lerp(targetPosition.clone().add(cameraOffset), 0.05);
        this.camera.lookAt(targetPosition);
    }
    
    /**
     * Get camera offset for competitive mode based on gate direction
     */
    getCompetitiveCameraOffset() {
        const distance = this.cameraDistance;
        const height = this.cameraDistance; // Use dynamic height for proper zoom behavior
        
        switch (this.competitiveCameraDirection) {
            case 'north':
                // Gate at north, camera offset to south
                return new THREE.Vector3(0, height, -distance);
            case 'south':
                // Gate at south, camera offset to north
                return new THREE.Vector3(0, height, distance);
            case 'east':
                // Gate at east, camera offset to west
                return new THREE.Vector3(-distance, height, 0);
            case 'west':
                // Gate at west, camera offset to east
                return new THREE.Vector3(distance, height, 0);
            case 'southeast':
                // Gate at southeast, camera offset to northwest
                return new THREE.Vector3(-distance * 0.7, height, distance * 0.7);
            case 'southwest':
                // Gate at southwest, camera offset to northeast
                return new THREE.Vector3(distance * 0.7, height, distance * 0.7);
            default:
                // Fallback to default
                return new THREE.Vector3(0, height, -distance);
        }
    }
    
    // Set mobile controls reference for zoom integration
    setMobileControls(mobileControls) {
        this.mobileControls = mobileControls;
        
        // Set up zoom change callback for mobile controls
        if (mobileControls) {
            mobileControls.setZoomChangeCallback((zoomLevel) => {
                this.cameraDistance = zoomLevel;
            });
        }
    }
    
    // Set gamepad manager reference for zoom integration
    setGamepadManager(gamepadManager) {
        this.gamepadManager = gamepadManager;
    }
    
    setupMouseControls() {
        // Mouse wheel for zoom (desktop only)
        this.renderer.domElement.addEventListener('wheel', (event) => {
            event.preventDefault();
            
            // Only handle mouse wheel if not on mobile device
            if (this.mobileControls && this.mobileControls.getIsTouchDevice()) {
                return;
            }
            
            const zoomSpeed = 5;
            
            if (event.deltaY > 0) {
                // Zoom out
                this.cameraDistance = Math.min(this.maxCameraDistance, this.cameraDistance + zoomSpeed);
            } else {
                // Zoom in
                this.cameraDistance = Math.max(this.minCameraDistance, this.cameraDistance - zoomSpeed);
            }
            
            // Note: Mobile zoom slider now handled by React MobileHUD component
        });
    }
    
    // Handle gamepad zoom controls - should be called every frame
    handleGamepadZoom() {
        if (!this.gamepadManager || !this.gamepadManager.isConnected()) {
            return;
        }
        
        const zoomSpeed = 1.5; // Reduced sensitivity for more precise control
        
        if (this.gamepadManager.isZoomInPressed()) {
            // Zoom in with A button
            this.cameraDistance = Math.max(this.minCameraDistance, this.cameraDistance - zoomSpeed);
        }
        
        if (this.gamepadManager.isZoomOutPressed()) {
            // Zoom out with B button
            this.cameraDistance = Math.min(this.maxCameraDistance, this.cameraDistance + zoomSpeed);
        }
    }
    
    // Get current camera distance for mobile controls synchronization
    getCameraDistance() {
        return this.cameraDistance;
    }
    
    // Set camera distance (used by mobile controls)
    setCameraDistance(distance) {
        this.cameraDistance = Math.max(this.minCameraDistance, 
                                     Math.min(this.maxCameraDistance, distance));
    }
    
    // Set camera zoom (alias for setCameraDistance, used by UI)
    setCameraZoom(zoomLevel) {
        this.setCameraDistance(zoomLevel);
    }
    
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
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
    
    /**
     * Set camera position based on player's assigned gate in competitive mode
     * @param {Object} playerGate - The gate assigned to the current player
     */
    setCompetitiveCameraPosition(playerGate) {
        if (!playerGate || !playerGate.direction) {
            console.warn('Invalid player gate for competitive camera setup');
            return;
        }

        // Store the competitive camera direction for use in updateCamera
        this.competitiveCameraDirection = playerGate.direction;
        
        // Set initial camera position and look at center
        const cameraHeight = this.cameraDistance;
        const cameraDistance = this.cameraDistance;
        
        // Position camera on opposite side of the gate, looking towards center
        switch (playerGate.direction) {
            case 'north':
                // Gate at north (0, 100), camera looks from south
                this.camera.position.set(0, cameraHeight, -cameraDistance);
                break;
            case 'south':
                // Gate at south (0, -100), camera looks from north  
                this.camera.position.set(0, cameraHeight, cameraDistance);
                break;
            case 'east':
                // Gate at east (100, 0), camera looks from west
                this.camera.position.set(-cameraDistance, cameraHeight, 0);
                break;
            case 'west':
                // Gate at west (-100, 0), camera looks from east
                this.camera.position.set(cameraDistance, cameraHeight, 0);
                break;
            case 'southeast':
                // Gate at southeast (70, -70), camera looks from northwest
                this.camera.position.set(-cameraDistance * 0.7, cameraHeight, cameraDistance * 0.7);
                break;
            case 'southwest':
                // Gate at southwest (-70, -70), camera looks from northeast
                this.camera.position.set(cameraDistance * 0.7, cameraHeight, cameraDistance * 0.7);
                break;
            default:
                console.warn(`Unknown gate direction: ${playerGate.direction}, using default camera position`);
                this.camera.position.set(0, cameraHeight, -cameraDistance);
                break;
        }
        
        // Always look towards the center of the field
        this.camera.lookAt(0, 0, 0);
        
        console.log(`[CAMERA] Set competitive camera for ${playerGate.direction} gate: position(${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z}), direction stored: ${this.competitiveCameraDirection}`);
    }

    /**
     * Reset camera to default position for solo/cooperative modes
     */
    resetCameraToDefault() {
        // Clear competitive camera direction
        this.competitiveCameraDirection = null;
        
        this.camera.position.set(0, 60, -60);
        this.camera.lookAt(0, 0, 0);
        console.log('[CAMERA] Reset to default position for solo/cooperative mode');
    }

    /**
     * Transform movement direction based on competitive camera orientation
     * @param {Vector2D} movementDirection - Original movement direction from input
     * @returns {Vector2D} - Transformed movement direction
     */
    transformMovementForCompetitive(movementDirection) {
        if (!this.competitiveCameraDirection || !movementDirection) {
            return movementDirection; // No transformation needed
        }

        // Use the imported Vector2D class for creating new instances
        const x = movementDirection.x;
        const z = movementDirection.z;

        switch (this.competitiveCameraDirection) {
            case 'north':
                // Default orientation - no transformation needed
                return movementDirection;
                
            case 'south':
                // Facing south - flip forward/backward, left/right
                return new Vector2D(-x, -z);
                
            case 'east':
                // Camera looking from west - rotate 90° counter-clockwise
                // W (forward) should move right in world space (+X)
                // D (right) should move forward in world space (+Z)
                return new Vector2D(z, -x);
                
            case 'west':
                // Camera looking from east - rotate 90° clockwise
                // W (forward) should move left in world space (-X)
                // D (right) should move backward in world space (-Z)
                return new Vector2D(-z, x);
                
            case 'southeast':
                // Facing southeast - rotate 135° clockwise
                const seX = (-x - z) * 0.7071; // cos(135°) ≈ -0.7071
                const seZ = (x - z) * 0.7071;  // sin(135°) ≈ 0.7071
                return new Vector2D(seX, seZ);
                
            case 'southwest':
                // Facing southwest - rotate 45° clockwise  
                const swX = (-x + z) * 0.7071; // cos(45°) ≈ 0.7071
                const swZ = (-x - z) * 0.7071; // sin(45°) ≈ 0.7071
                return new Vector2D(swX, swZ);
                
            default:
                return movementDirection;
        }
    }

}
