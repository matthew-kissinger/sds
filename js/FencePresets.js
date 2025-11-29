import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * FencePresets - Modular fence asset system for reusable fence components
 *
 * Features:
 * - Standalone fence segments (borders, gates, pens)
 * - Proper handling of multiplayer configurations
 * - Optimized geometry with instancing support
 * - Configurable materials and colors
 * - GLB model support for fence components
 */

export class FencePresets {
    constructor() {
        // Standard dimensions
        this.fenceHeight = 2.5;
        this.postRadius = 0.12;
        this.railHeight = 0.15;
        this.railWidth = 0.1;
        this.postSpacing = 5; // Distance between posts

        // GLB Model loader
        this.loader = new GLTFLoader();
        this.models = {
            fencePost: null,
            fenceRail: null,
            fenceSegment: null,
            gatePost: null,
            gateComplete: null,
            gateArch: null,
            cornerPost: null
        };
        this.modelsLoaded = false;
        this.useGLBModels = true; // Toggle to use GLB vs procedural

        // Materials - warm wood tones that contrast with green grass
        this.materials = {
            post: new THREE.MeshPhongMaterial({
                color: 0x8B7355,  // Warm tan/beige wood
                emissive: 0x2a1a08,
                emissiveIntensity: 0.15,
                shininess: 5
            }),
            rail: new THREE.MeshPhongMaterial({
                color: 0x9C8465,  // Lighter warm wood
                emissive: 0x3a2a10,
                emissiveIntensity: 0.12,
                shininess: 8
            }),
            gate: new THREE.MeshPhongMaterial({
                color: 0xA89070,  // Even lighter for gates
                emissive: 0x4a3a18,
                emissiveIntensity: 0.18,
                shininess: 10
            })
        };

        // Cached geometries (fallback for when GLB not loaded)
        this.geometries = {
            post: new THREE.CylinderGeometry(this.postRadius, this.postRadius, this.fenceHeight, 8),
            rail: new THREE.BoxGeometry(this.postSpacing, this.railHeight, this.railWidth)
        };
    }

    /**
     * Load GLB fence models
     * @returns {Promise} Promise that resolves when all models are loaded
     */
    async loadModels() {
        if (this.modelsLoaded) return;

        const modelPaths = {
            fencePost: 'assets/models/Fence_Post-v1.0.0.glb',
            fenceRail: 'assets/models/Fence_Rail-v1.0.0.glb',
            fenceSegment: 'assets/models/Fence_Segment-v1.0.0.glb',
            gatePost: 'assets/models/Gate_Post-v1.0.0.glb',
            gateComplete: 'assets/models/Gate_Complete-v1.0.0.glb',
            gateArch: 'assets/models/Gate_Arch-v1.0.0.glb',
            cornerPost: 'assets/models/Corner_Post-v1.0.0.glb'
        };

        const loadPromises = Object.entries(modelPaths).map(async ([name, path]) => {
            try {
                const gltf = await this.loader.loadAsync(path);
                this.models[name] = gltf.scene;
                // Enable shadows on all meshes in the model
                gltf.scene.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                console.log(`[OK] Loaded fence model: ${name}`);
            } catch (err) {
                console.warn(`[WARN] Failed to load fence model ${name}:`, err);
            }
        });

        await Promise.all(loadPromises);
        this.modelsLoaded = true;
        console.log('[OK] Fence models loaded');
    }

    /**
     * Clone a GLB model for use
     * @param {string} modelName - Name of the model to clone
     * @returns {THREE.Group|null} Cloned model or null if not available
     */
    cloneModel(modelName) {
        if (!this.models[modelName]) return null;
        return this.models[modelName].clone();
    }
    
    /**
     * Create a straight border fence segment
     * @param {number} length - Length of the border
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {Object} options - Additional options
     * @returns {THREE.Group} - Border fence group
     */
    createBorderSegment(length, orientation = 'horizontal', options = {}) {
        const group = new THREE.Group();

        // Use GLB posts and rails if available (builds fence from components)
        if (this.useGLBModels && this.models.fencePost && this.models.fenceRail) {
            // Post spacing - 5 units between posts
            const postSpacing = 5.0;
            const postCount = Math.ceil(length / postSpacing) + 1;
            const actualSpacing = length / (postCount - 1);

            // The rail model is 1 unit long, centered at origin (for easy scaling)
            const railModelLength = 1.0;

            // Create posts
            for (let i = 0; i < postCount; i++) {
                const post = this.cloneModel('fencePost');
                if (post) {
                    if (orientation === 'horizontal') {
                        post.position.x = i * actualSpacing - length / 2;
                    } else {
                        post.rotation.y = Math.PI / 2;
                        post.position.z = i * actualSpacing - length / 2;
                    }
                    group.add(post);
                }
            }

            // Create rails between posts (3 levels based on fence segment model)
            const railHeights = [0.5, 1.2, 1.9];
            for (const height of railHeights) {
                for (let i = 0; i < postCount - 1; i++) {
                    const rail = this.cloneModel('fenceRail');
                    if (rail) {
                        // Scale rail to match actual spacing between posts
                        const scaleX = actualSpacing / railModelLength;
                        rail.scale.set(scaleX, 1, 1);

                        if (orientation === 'horizontal') {
                            rail.position.set(
                                i * actualSpacing + actualSpacing / 2 - length / 2,
                                height,
                                0
                            );
                        } else {
                            rail.rotation.y = Math.PI / 2;
                            rail.position.set(
                                0,
                                height,
                                i * actualSpacing + actualSpacing / 2 - length / 2
                            );
                        }
                        group.add(rail);
                    }
                }
            }

            return group;
        }

        // Fallback to procedural geometry
        const postCount = Math.ceil(length / this.postSpacing) + 1;
        const actualSpacing = length / (postCount - 1);

        // Create posts
        for (let i = 0; i < postCount; i++) {
            const post = new THREE.Mesh(this.geometries.post, this.materials.post);
            post.position.y = this.fenceHeight / 2;

            if (orientation === 'horizontal') {
                post.position.x = i * actualSpacing - length / 2;
            } else {
                post.position.z = i * actualSpacing - length / 2;
            }

            post.castShadow = true;
            post.receiveShadow = true;
            group.add(post);
        }

        // Create rails (3 levels)
        const railLevels = [0.5, 1.2, 1.9];
        for (let level of railLevels) {
            for (let i = 0; i < postCount - 1; i++) {
                const railGeo = new THREE.BoxGeometry(
                    orientation === 'horizontal' ? actualSpacing : this.railWidth,
                    this.railHeight,
                    orientation === 'horizontal' ? this.railWidth : actualSpacing
                );
                const rail = new THREE.Mesh(railGeo, this.materials.rail);

                if (orientation === 'horizontal') {
                    rail.position.set(
                        i * actualSpacing + actualSpacing / 2 - length / 2,
                        level,
                        0
                    );
                } else {
                    rail.position.set(
                        0,
                        level,
                        i * actualSpacing + actualSpacing / 2 - length / 2
                    );
                }

                rail.castShadow = true;
                rail.receiveShadow = true;
                group.add(rail);
            }
        }

        return group;
    }
    
    /**
     * Create a border segment with a gate opening
     * @param {number} length - Total length of the border
     * @param {number} gateWidth - Width of the gate opening
     * @param {number} gatePosition - Position of gate center (0 = center of border)
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {Object} gateConfig - Gate configuration (color, playerId, etc)
     * @returns {THREE.Group} - Border with gate group
     */
    createBorderWithGate(length, gateWidth = 8, gatePosition = 0, orientation = 'horizontal', gateConfig = {}) {
        const group = new THREE.Group();
        
        // Calculate segment positions
        const gateStart = gatePosition - gateWidth/2;
        const gateEnd = gatePosition + gateWidth/2;
        
        // Create left segment
        if (gateStart > -length/2) {
            const leftLength = gateStart + length/2;
            const leftSegment = this.createBorderSegment(leftLength, orientation);
            
            if (orientation === 'horizontal') {
                leftSegment.position.x = -length/2 + leftLength/2;
            } else {
                leftSegment.position.z = -length/2 + leftLength/2;
            }
            
            group.add(leftSegment);
        }
        
        // Create right segment
        if (gateEnd < length/2) {
            const rightLength = length/2 - gateEnd;
            const rightSegment = this.createBorderSegment(rightLength, orientation);
            
            if (orientation === 'horizontal') {
                rightSegment.position.x = gateEnd + rightLength/2;
            } else {
                rightSegment.position.z = gateEnd + rightLength/2;
            }
            
            group.add(rightSegment);
        }
        
        // Create gate structure
        const gateGroup = this.createGateStructure(gateWidth, orientation, gateConfig);
        if (orientation === 'horizontal') {
            gateGroup.position.x = gatePosition;
        } else {
            gateGroup.position.z = gatePosition;
        }
        group.add(gateGroup);
        
        return group;
    }
    
    /**
     * Create a gate structure
     * @param {number} width - Width of the gate
     * @param {string} orientation - 'horizontal' or 'vertical'
     * @param {Object} config - Gate configuration
     * @returns {THREE.Group} - Gate structure group
     */
    createGateStructure(width, orientation = 'horizontal', config = {}) {
        const group = new THREE.Group();
        const gateColor = config.color || 0x4a3c28;
        const gateHeight = 3.5; // Gate post height from GLB

        // Use modular GLB components: gate posts + arch
        if (this.useGLBModels && this.models.gatePost) {
            // Gate posts
            const leftPost = this.cloneModel('gatePost');
            const rightPost = this.cloneModel('gatePost');

            if (leftPost && rightPost) {
                if (orientation === 'horizontal') {
                    leftPost.position.x = -width / 2;
                    rightPost.position.x = width / 2;
                } else {
                    leftPost.position.z = -width / 2;
                    rightPost.position.z = width / 2;
                }

                group.add(leftPost);
                group.add(rightPost);
            }

            // Gate arch (if available)
            if (this.models.gateArch) {
                const arch = this.cloneModel('gateArch');
                if (arch) {
                    // Arch model is 1.44 units long, scale to gate width
                    const archModelLength = 1.44;
                    const archScale = (width + 0.8) / archModelLength; // Slightly wider to span posts
                    arch.scale.set(archScale, 1, 1);
                    arch.position.y = gateHeight;

                    if (orientation === 'vertical') {
                        arch.rotation.y = Math.PI / 2;
                    }

                    group.add(arch);
                }
            } else {
                // Fallback arch using procedural geometry
                const archGeometry = new THREE.CylinderGeometry(0.2, 0.2, width + 1, 8);
                const archMaterial = new THREE.MeshPhongMaterial({
                    color: 0x7A6548,
                    roughness: 0.75
                });
                const arch = new THREE.Mesh(archGeometry, archMaterial);
                arch.position.y = gateHeight;
                arch.rotation.z = orientation === 'horizontal' ? Math.PI / 2 : 0;
                if (orientation === 'vertical') arch.rotation.x = Math.PI / 2;
                arch.castShadow = true;
                group.add(arch);
            }

            // Visual threshold effect (glowing ground marker instead of asset)
            this.addThresholdEffect(group, width, orientation, gateColor);

            return group;
        }

        // Fallback to fully procedural geometry
        const gateMaterial = new THREE.MeshPhongMaterial({
            color: gateColor,
            emissive: this.darkenColor(gateColor, 0.8),
            emissiveIntensity: 0.1
        });

        // Gate posts
        const postGeometry = new THREE.CylinderGeometry(0.4, 0.4, gateHeight, 8);
        const leftPost = new THREE.Mesh(postGeometry, gateMaterial);
        const rightPost = new THREE.Mesh(postGeometry, gateMaterial);
        leftPost.position.y = gateHeight / 2;
        rightPost.position.y = gateHeight / 2;

        if (orientation === 'horizontal') {
            leftPost.position.x = -width / 2;
            rightPost.position.x = width / 2;
        } else {
            leftPost.position.z = -width / 2;
            rightPost.position.z = width / 2;
        }

        leftPost.castShadow = true;
        leftPost.receiveShadow = true;
        rightPost.castShadow = true;
        rightPost.receiveShadow = true;

        group.add(leftPost);
        group.add(rightPost);

        // Decorative arch
        const archGeometry = new THREE.CylinderGeometry(0.2, 0.2, width + 1, 8);
        const archMaterial = new THREE.MeshPhongMaterial({
            color: this.lightenColor(gateColor, 0.3),
            emissive: this.darkenColor(gateColor, 0.7),
            emissiveIntensity: 0.1
        });

        const arch = new THREE.Mesh(archGeometry, archMaterial);
        arch.position.y = gateHeight;

        if (orientation === 'horizontal') {
            arch.rotation.z = Math.PI / 2;
        } else {
            arch.rotation.x = Math.PI / 2;
        }

        arch.castShadow = true;
        group.add(arch);

        // Visual threshold effect
        this.addThresholdEffect(group, width, orientation, gateColor);

        return group;
    }

    /**
     * Add visual threshold effect for gate entrance (glowing ground marker)
     */
    addThresholdEffect(group, width, orientation, color) {
        // Create a subtle glowing ground plane for the gate threshold
        const thresholdGeometry = new THREE.PlaneGeometry(
            orientation === 'horizontal' ? width + 2 : 4,
            orientation === 'horizontal' ? 4 : width + 2
        );
        const thresholdMaterial = new THREE.MeshBasicMaterial({
            color: this.lightenColor(color, 0.4),
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });

        const threshold = new THREE.Mesh(thresholdGeometry, thresholdMaterial);
        threshold.rotation.x = -Math.PI / 2;
        threshold.position.y = 0.05; // Slightly above ground to avoid z-fighting
        group.add(threshold);

        // Add edge glow lines
        const edgeMaterial = new THREE.MeshBasicMaterial({
            color: this.lightenColor(color, 0.6),
            transparent: true,
            opacity: 0.5
        });

        const edgeWidth = 0.15;
        const edgeGeometry = new THREE.BoxGeometry(
            orientation === 'horizontal' ? width + 2 : edgeWidth,
            0.1,
            orientation === 'horizontal' ? edgeWidth : width + 2
        );

        // Front edge
        const frontEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        frontEdge.position.y = 0.05;
        frontEdge.position.z = orientation === 'horizontal' ? 1.5 : 0;
        frontEdge.position.x = orientation === 'horizontal' ? 0 : 1.5;
        group.add(frontEdge);

        // Back edge
        const backEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        backEdge.position.y = 0.05;
        backEdge.position.z = orientation === 'horizontal' ? -1.5 : 0;
        backEdge.position.x = orientation === 'horizontal' ? 0 : -1.5;
        group.add(backEdge);
    }

    /**
     * Create a gate structure (legacy - keeping old signature)
     * Gate threshold marker - now uses visual effect instead of asset
     */
    createGateThresholdLegacy(width, orientation, gateColor) {
        const thresholdGeometry = new THREE.BoxGeometry(
            orientation === 'horizontal' ? width + 2 : 3,
            0.15,
            orientation === 'horizontal' ? 3 : width + 2
        );
        const thresholdMaterial = new THREE.MeshPhongMaterial({
            color: this.lightenColor(gateColor, 0.5),
            emissive: this.darkenColor(gateColor, 0.5),
            emissiveIntensity: 0.3
        });

        const threshold = new THREE.Mesh(thresholdGeometry, thresholdMaterial);
        threshold.position.y = 0.075;
        group.add(threshold);

        return group;
    }
    
    /**
     * Create a pen/pasture structure that attaches to the main field border
     * @param {Object} dimensions - {width, depth}
     * @param {string} attachmentSide - Which field border the pen attaches to ('north', 'south', 'east', 'west')
     * @returns {THREE.Group} - Pen structure group
     */
    createPenStructure(dimensions, attachmentSide = 'north') {
        const group = new THREE.Group();
        const { width = 60, depth = 30 } = dimensions;
        
        // Create three sides based on attachment side
        // The fourth side (entrance) connects to the field border with the gate
        
        if (attachmentSide === 'north') {
            // Back fence (extends into field)
            const backFence = this.createBorderSegment(width, 'horizontal');
            backFence.position.z = depth;
            group.add(backFence);
            
            // Side fences extend from border into field
            const leftFence = this.createBorderSegment(depth, 'vertical');
            leftFence.position.x = -width/2;
            leftFence.position.z = depth/2;
            group.add(leftFence);
            
            const rightFence = this.createBorderSegment(depth, 'vertical');
            rightFence.position.x = width/2;
            rightFence.position.z = depth/2;
            group.add(rightFence);
        } else if (attachmentSide === 'south') {
            // Back fence (extends into field)
            const backFence = this.createBorderSegment(width, 'horizontal');
            backFence.position.z = -depth;
            group.add(backFence);
            
            // Side fences extend from border into field
            const leftFence = this.createBorderSegment(depth, 'vertical');
            leftFence.position.x = -width/2;
            leftFence.position.z = -depth/2;
            group.add(leftFence);
            
            const rightFence = this.createBorderSegment(depth, 'vertical');
            rightFence.position.x = width/2;
            rightFence.position.z = -depth/2;
            group.add(rightFence);
        } else if (attachmentSide === 'east') {
            // Back fence (extends into field) - width tall, at depth distance
            const backFence = this.createBorderSegment(width, 'vertical');
            backFence.position.x = depth;
            backFence.position.z = 0;
            group.add(backFence);
            
            // Side fences extend from border into field - depth long
            const topFence = this.createBorderSegment(depth, 'horizontal');
            topFence.position.z = width/2;
            topFence.position.x = depth/2;
            group.add(topFence);
            
            const bottomFence = this.createBorderSegment(depth, 'horizontal');
            bottomFence.position.z = -width/2;
            bottomFence.position.x = depth/2;
            group.add(bottomFence);
        } else { // west
            // Back fence (extends into field) - width tall, at depth distance
            const backFence = this.createBorderSegment(width, 'vertical');
            backFence.position.x = -depth;
            backFence.position.z = 0;
            group.add(backFence);
            
            // Side fences extend from border into field - depth long
            const topFence = this.createBorderSegment(depth, 'horizontal');
            topFence.position.z = width/2;
            topFence.position.x = -depth/2;
            group.add(topFence);
            
            const bottomFence = this.createBorderSegment(depth, 'horizontal');
            bottomFence.position.z = -width/2;
            bottomFence.position.x = -depth/2;
            group.add(bottomFence);
        }
        
        return group;
    }
    
    /**
     * Create a corner connection piece for diagonal gates
     * @param {string} cornerType - 'northeast', 'northwest', 'southeast', 'southwest'
     * @param {number} gateWidth - Width of the gate opening
     * @param {Object} gateConfig - Gate configuration
     * @returns {THREE.Group} - Corner structure group
     */
    createCornerWithGate(cornerType, gateWidth = 8, gateConfig = {}) {
        const group = new THREE.Group();
        
        // Create two fence segments that meet at corner
        const segment1 = this.createBorderSegment(50, 'horizontal');
        const segment2 = this.createBorderSegment(50, 'vertical');
        
        // Position based on corner type
        switch(cornerType) {
            case 'northeast':
                segment1.position.set(-25, 0, 0);
                segment2.position.set(0, 0, -25);
                break;
            case 'northwest':
                segment1.position.set(25, 0, 0);
                segment2.position.set(0, 0, -25);
                break;
            case 'southeast':
                segment1.position.set(-25, 0, 0);
                segment2.position.set(0, 0, 25);
                break;
            case 'southwest':
                segment1.position.set(25, 0, 0);
                segment2.position.set(0, 0, 25);
                break;
        }
        
        group.add(segment1);
        group.add(segment2);
        
        // Add corner post
        const cornerPost = new THREE.Mesh(
            new THREE.CylinderGeometry(0.2, 0.2, this.fenceHeight + 0.5, 8),
            this.materials.post
        );
        cornerPost.position.y = (this.fenceHeight + 0.5) / 2;
        cornerPost.castShadow = true;
        cornerPost.receiveShadow = true;
        group.add(cornerPost);
        
        // Add diagonal gate if needed
        if (gateConfig.diagonal) {
            const diagonalGate = this.createGateStructure(gateWidth, 'diagonal', gateConfig);
            // Position gate at 45-degree angle
            diagonalGate.rotation.y = Math.PI / 4 * (cornerType.includes('east') ? 1 : -1);
            group.add(diagonalGate);
        }
        
        return group;
    }
    
    /**
     * Helper function to lighten a color
     */
    lightenColor(color, amount) {
        const c = new THREE.Color(color);
        c.r = Math.min(1, c.r + amount);
        c.g = Math.min(1, c.g + amount);
        c.b = Math.min(1, c.b + amount);
        return c.getHex();
    }
    
    /**
     * Helper function to darken a color
     */
    darkenColor(color, amount) {
        const c = new THREE.Color(color);
        c.r = Math.max(0, c.r * amount);
        c.g = Math.max(0, c.g * amount);
        c.b = Math.max(0, c.b * amount);
        return c.getHex();
    }
    
    /**
     * Create optimized instanced fence system for large boundaries
     * @param {Array} segments - Array of segment definitions
     * @returns {THREE.InstancedMesh} - Instanced mesh for all fence posts
     */
    createInstancedFenceSystem(segments) {
        // Count total posts needed
        let totalPosts = 0;
        segments.forEach(segment => {
            totalPosts += Math.ceil(segment.length / this.postSpacing) + 1;
        });
        
        // Create instanced mesh for posts
        const postMesh = new THREE.InstancedMesh(
            this.geometries.post,
            this.materials.post,
            totalPosts
        );
        
        // Set up matrices for each post
        const matrix = new THREE.Matrix4();
        let postIndex = 0;
        
        segments.forEach(segment => {
            const postCount = Math.ceil(segment.length / this.postSpacing) + 1;
            const actualSpacing = segment.length / (postCount - 1);
            
            for (let i = 0; i < postCount; i++) {
                matrix.identity();
                
                const position = new THREE.Vector3();
                if (segment.orientation === 'horizontal') {
                    position.set(
                        segment.start.x + i * actualSpacing * (segment.end.x > segment.start.x ? 1 : -1),
                        this.fenceHeight / 2,
                        segment.start.z
                    );
                } else {
                    position.set(
                        segment.start.x,
                        this.fenceHeight / 2,
                        segment.start.z + i * actualSpacing * (segment.end.z > segment.start.z ? 1 : -1)
                    );
                }
                
                matrix.setPosition(position);
                postMesh.setMatrixAt(postIndex++, matrix);
            }
        });
        
        postMesh.instanceMatrix.needsUpdate = true;
        postMesh.castShadow = true;
        postMesh.receiveShadow = true;
        
        return postMesh;
    }
}

/**
 * Fence configuration builder for different game modes
 */
export class FenceConfigBuilder {
    constructor(fencePresets) {
        this.presets = fencePresets;
    }
    
    /**
     * Build single player fence configuration
     */
    buildSinglePlayerFences(bounds, gate, pasture) {
        const fences = new THREE.Group();
        
        // North fence with gate
        const northFence = this.presets.createBorderWithGate(
            bounds.maxX - bounds.minX,
            gate.width,
            gate.position.x,
            'horizontal'
        );
        northFence.position.set(0, 0, bounds.maxZ);
        fences.add(northFence);
        
        // South fence
        const southFence = this.presets.createBorderSegment(
            bounds.maxX - bounds.minX,
            'horizontal'
        );
        southFence.position.set(0, 0, bounds.minZ);
        fences.add(southFence);
        
        // East fence
        const eastFence = this.presets.createBorderSegment(
            bounds.maxZ - bounds.minZ,
            'vertical'
        );
        eastFence.position.set(bounds.maxX, 0, 0);
        fences.add(eastFence);
        
        // West fence
        const westFence = this.presets.createBorderSegment(
            bounds.maxZ - bounds.minZ,
            'vertical'
        );
        westFence.position.set(bounds.minX, 0, 0);
        fences.add(westFence);
        
        // Add pasture pen attached to north border
        const pen = this.presets.createPenStructure({
            width: pasture.maxX - pasture.minX,
            depth: pasture.maxZ - pasture.minZ
        }, 'north');
        pen.position.set(
            (pasture.maxX + pasture.minX) / 2,
            0,
            bounds.maxZ  // Position at field border
        );
        fences.add(pen);
        
        return fences;
    }
    
    /**
     * Build competitive multiplayer fence configuration
     */
    buildCompetitiveFences(bounds, competitiveGates) {
        const fences = new THREE.Group();
        const playerCount = competitiveGates.length;
        
        if (playerCount === 2) {
            // Simple north/south configuration
            return this.build2PlayerFences(bounds, competitiveGates);
        } else if (playerCount === 3) {
            // Complex configuration with corner gates
            return this.build3PlayerFences(bounds, competitiveGates);
        } else if (playerCount === 4) {
            // Cardinal directions configuration
            return this.build4PlayerFences(bounds, competitiveGates);
        }
        
        return fences;
    }
    
    /**
     * Build 2-player fence configuration
     */
    build2PlayerFences(bounds, gates) {
        const fences = new THREE.Group();
        
        // North fence with gate
        const northGate = gates.find(g => g.position.z > 50);
        const northFence = this.presets.createBorderWithGate(
            bounds.maxX - bounds.minX,
            northGate.width,
            northGate.position.x,
            'horizontal',
            northGate
        );
        northFence.position.set(0, 0, bounds.maxZ);
        fences.add(northFence);
        
        // South fence with gate
        const southGate = gates.find(g => g.position.z < -50);
        const southFence = this.presets.createBorderWithGate(
            bounds.maxX - bounds.minX,
            southGate.width,
            southGate.position.x,
            'horizontal',
            southGate
        );
        southFence.position.set(0, 0, bounds.minZ);
        fences.add(southFence);
        
        // Side fences (no gates)
        const eastFence = this.presets.createBorderSegment(bounds.maxZ - bounds.minZ, 'vertical');
        eastFence.position.set(bounds.maxX, 0, 0);
        fences.add(eastFence);
        
        const westFence = this.presets.createBorderSegment(bounds.maxZ - bounds.minZ, 'vertical');
        westFence.position.set(bounds.minX, 0, 0);
        fences.add(westFence);
        
        // Add pens for each gate
        gates.forEach(gate => {
            // For east/west gates, swap width and depth since pastures are rotated
            let width, depth;
            if (gate.direction === 'east' || gate.direction === 'west') {
                width = gate.pasture.maxZ - gate.pasture.minZ;  // Z dimension becomes width
                depth = gate.pasture.maxX - gate.pasture.minX;  // X dimension becomes depth
            } else {
                width = gate.pasture.maxX - gate.pasture.minX;  // Standard for north/south
                depth = gate.pasture.maxZ - gate.pasture.minZ;
            }
            
            const pen = this.presets.createPenStructure({
                width: width,
                depth: depth
            }, gate.direction);
            
            // Position pen at the field border where the gate is
            let penX = (gate.pasture.maxX + gate.pasture.minX) / 2;
            let penZ = (gate.pasture.maxZ + gate.pasture.minZ) / 2;
            
            // Adjust position to connect with field border
            if (gate.direction === 'north') {
                penZ = bounds.maxZ;
            } else if (gate.direction === 'south') {
                penZ = bounds.minZ;
            } else if (gate.direction === 'east') {
                penX = bounds.maxX;
            } else if (gate.direction === 'west') {
                penX = bounds.minX;
            }
            
            pen.position.set(penX, 0, penZ);
            fences.add(pen);
        });
        
        return fences;
    }
    
    /**
     * Build 3-player fence configuration (North, East, West gates)
     */
    build3PlayerFences(bounds, gates) {
        const fences = new THREE.Group();
        
        // North fence with gate
        const northGate = gates.find(g => Math.abs(g.position.z - bounds.maxZ) < 1);
        if (northGate) {
            const northFence = this.presets.createBorderWithGate(
                bounds.maxX - bounds.minX,
                northGate.width,
                northGate.position.x,
                'horizontal',
                northGate
            );
            northFence.position.set(0, 0, bounds.maxZ);
            fences.add(northFence);
        }
        
        // South fence (no gate)
        const southFence = this.presets.createBorderSegment(bounds.maxX - bounds.minX, 'horizontal');
        southFence.position.set(0, 0, bounds.minZ);
        fences.add(southFence);
        
        // East fence with gate
        const eastGate = gates.find(g => Math.abs(g.position.x - bounds.maxX) < 1);
        if (eastGate) {
            const eastFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                eastGate.width,
                eastGate.position.z,
                'vertical',
                eastGate
            );
            eastFence.position.set(bounds.maxX, 0, 0);
            fences.add(eastFence);
        }
        
        // West fence with gate
        const westGate = gates.find(g => Math.abs(g.position.x - bounds.minX) < 1);
        if (westGate) {
            const westFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                westGate.width,
                westGate.position.z,
                'vertical',
                westGate
            );
            westFence.position.set(bounds.minX, 0, 0);
            fences.add(westFence);
        }
        
        // Add pens for each gate
        gates.forEach(gate => {
            // For east/west gates, swap width and depth since pastures are rotated
            let width, depth;
            if (gate.direction === 'east' || gate.direction === 'west') {
                width = gate.pasture.maxZ - gate.pasture.minZ;  // Z dimension becomes width
                depth = gate.pasture.maxX - gate.pasture.minX;  // X dimension becomes depth
            } else {
                width = gate.pasture.maxX - gate.pasture.minX;  // Standard for north/south
                depth = gate.pasture.maxZ - gate.pasture.minZ;
            }
            
            const pen = this.presets.createPenStructure({
                width: width,
                depth: depth
            }, gate.direction);
            
            // Position pen at the field border where the gate is
            let penX = (gate.pasture.maxX + gate.pasture.minX) / 2;
            let penZ = (gate.pasture.maxZ + gate.pasture.minZ) / 2;
            
            // Adjust position to connect with field border
            if (gate.direction === 'north') {
                penZ = bounds.maxZ;
            } else if (gate.direction === 'south') {
                penZ = bounds.minZ;
            } else if (gate.direction === 'east') {
                penX = bounds.maxX;
            } else if (gate.direction === 'west') {
                penX = bounds.minX;
            }
            
            pen.position.set(penX, 0, penZ);
            fences.add(pen);
        });
        
        return fences;
    }
    
    /**
     * Build 4-player fence configuration
     */
    build4PlayerFences(bounds, gates) {
        const fences = new THREE.Group();
        
        // North fence with gate
        const northGate = gates.find(g => Math.abs(g.position.z - bounds.maxZ) < 1);
        if (northGate) {
            const northFence = this.presets.createBorderWithGate(
                bounds.maxX - bounds.minX,
                northGate.width,
                northGate.position.x,
                'horizontal',
                northGate
            );
            northFence.position.set(0, 0, bounds.maxZ);
            fences.add(northFence);
        }
        
        // South fence with gate
        const southGate = gates.find(g => Math.abs(g.position.z - bounds.minZ) < 1);
        if (southGate) {
            const southFence = this.presets.createBorderWithGate(
                bounds.maxX - bounds.minX,
                southGate.width,
                southGate.position.x,
                'horizontal',
                southGate
            );
            southFence.position.set(0, 0, bounds.minZ);
            fences.add(southFence);
        }
        
        // East fence with gate
        const eastGate = gates.find(g => Math.abs(g.position.x - bounds.maxX) < 1);
        if (eastGate) {
            const eastFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                eastGate.width,
                eastGate.position.z,
                'vertical',
                eastGate
            );
            eastFence.position.set(bounds.maxX, 0, 0);
            fences.add(eastFence);
        }
        
        // West fence with gate
        const westGate = gates.find(g => Math.abs(g.position.x - bounds.minX) < 1);
        if (westGate) {
            const westFence = this.presets.createBorderWithGate(
                bounds.maxZ - bounds.minZ,
                westGate.width,
                westGate.position.z,
                'vertical',
                westGate
            );
            westFence.position.set(bounds.minX, 0, 0);
            fences.add(westFence);
        }
        
        // Add pens for each gate
        gates.forEach(gate => {
            // For east/west gates, swap width and depth since pastures are rotated
            let width, depth;
            if (gate.direction === 'east' || gate.direction === 'west') {
                width = gate.pasture.maxZ - gate.pasture.minZ;  // Z dimension becomes width
                depth = gate.pasture.maxX - gate.pasture.minX;  // X dimension becomes depth
            } else {
                width = gate.pasture.maxX - gate.pasture.minX;  // Standard for north/south
                depth = gate.pasture.maxZ - gate.pasture.minZ;
            }
            
            const pen = this.presets.createPenStructure({
                width: width,
                depth: depth
            }, gate.direction);
            
            // Position pen at the field border where the gate is
            let penX = (gate.pasture.maxX + gate.pasture.minX) / 2;
            let penZ = (gate.pasture.maxZ + gate.pasture.minZ) / 2;
            
            // Adjust position to connect with field border
            if (gate.direction === 'north') {
                penZ = bounds.maxZ;
            } else if (gate.direction === 'south') {
                penZ = bounds.minZ;
            } else if (gate.direction === 'east') {
                penX = bounds.maxX;
            } else if (gate.direction === 'west') {
                penX = bounds.minX;
            }
            
            pen.position.set(penX, 0, penZ);
            fences.add(pen);
        });
        
        return fences;
    }
}