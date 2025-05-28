import * as THREE from 'three';

/**
 * SceneManager - Handles Three.js scene setup, lighting, and camera management
 * Enhanced with mobile zoom control support
 */
export class SceneManager {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75, 
            window.innerWidth / window.innerHeight, 
            0.1, 
            1000
        );
        
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance", // Use discrete GPU if available
            stencil: false // Disable stencil buffer if not needed
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Performance optimizations
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        // Enable frustum culling and other optimizations
        this.renderer.sortObjects = true;
        this.renderer.autoClear = true;
        
        document.getElementById('canvas-container').appendChild(this.renderer.domElement);
        
        // Camera control
        this.cameraDistance = 80;
        this.minCameraDistance = 20;
        this.maxCameraDistance = 150;
        this.mobileControls = null;
        
        this.init();
    }
    
    init() {
        // Set scene background
        this.scene.background = new THREE.Color(0x87CEEB); // Sky blue
        this.scene.fog = new THREE.Fog(0x87CEEB, 200, 600); // Extended fog for larger world
        
        // Setup camera - adjusted for larger field
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
        
        this.scene.add(directionalLight);
        
        // Add a subtle secondary light for better depth - adjusted for new lighting model
        const secondaryLight = new THREE.DirectionalLight(0xffd4a3, 0.3 * Math.PI);
        secondaryLight.position.set(-50, 40, -50);
        this.scene.add(secondaryLight);
    }
    
    updateCamera(sheepdog) {
        // Update camera to follow sheepdog - adjusted for dynamic zoom
        const cameraOffset = new THREE.Vector3(0, this.cameraDistance, -this.cameraDistance);
        const targetPosition = new THREE.Vector3(
            sheepdog.position.x,
            0,
            sheepdog.position.z
        );
        
        this.camera.position.lerp(targetPosition.clone().add(cameraOffset), 0.05);
        this.camera.lookAt(targetPosition);
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
            
            // Update mobile zoom slider if available
            if (this.mobileControls && this.mobileControls.zoomSlider) {
                this.mobileControls.zoomSlider.value = this.cameraDistance;
                this.mobileControls.zoomLevel = this.cameraDistance;
            }
        });
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
    
    getScene() {
        return this.scene;
    }
    
    getCamera() {
        return this.camera;
    }
    
    getRenderer() {
        return this.renderer;
    }
} 