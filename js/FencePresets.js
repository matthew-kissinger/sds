// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { configureGLTFLoader } from './TerrainBuilder.js';

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

        // GLB Model loader (Draco + Meshopt decoders for Phase A Unit B compressed GLBs).
        this.loader = configureGLTFLoader(new GLTFLoader());
        // The four pieces actually assembled at runtime. All four come from a
        // single shared-texture kit GLB (Fence_Kit) - see loadModels().
        this.models = {
            fencePost: null,
            fenceRail: null,
            gatePost: null,
            gateArch: null,
            gateAssembly: null
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

        // One shared-texture kit GLB instead of four standalone files that each
        // re-embedded the same wood texture set. The kit's default scene holds
        // four identity-wrapper nodes; cloning a wrapper reproduces exactly what
        // cloning the old per-file gltf.scene produced. Built by
        // tools/merge-fence-kit.mjs; pre-merge pieces live in assets/_originals.
        const KIT_PATH = 'assets/models/Fence_Kit-v1.0.0.glb';
        const GATE_PATH = 'assets/models/Gate_Assembly-v1.0.0.glb';
        const kitNodeNames = {
            fencePost: 'Fence_Post',
            fenceRail: 'Fence_Rail',
            gatePost: 'Gate_Post',
            gateArch: 'Gate_Arch'
        };

        try {
            const gltf = await this.loader.loadAsync(KIT_PATH);
            for (const [name, nodeName] of Object.entries(kitNodeNames)) {
                const node = gltf.scene.getObjectByName(nodeName);
                if (!node) {
                    console.warn(`[WARN] Fence kit missing node: ${nodeName}`);
                    continue;
                }
                // Enable shadows on every mesh in the piece.
                node.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                this.models[name] = node;
                console.log(`[OK] Loaded fence kit piece: ${name}`);
            }
        } catch (err) {
            console.warn('[WARN] Failed to load fence kit:', err);
        }

        try {
            const gltf = await this.loader.loadAsync(GATE_PATH);
            const gate = gltf.scene.getObjectByName('Gate_Assembly') || gltf.scene;
            gate.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            gate.userData.authoredWidth = 8;
            this.models.gateAssembly = gate;
            console.log('[OK] Loaded gate assembly');
        } catch (err) {
            console.warn('[WARN] Failed to load gate assembly:', err);
        }

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
    createBorderSegment(length, orientation = 'horizontal', _options = {}) {
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
                    post.userData.surfaceToTerrain = true;
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
                        rail.userData.surfaceToTerrain = true;
                        // Slope-along-terrain metadata: _surfaceToTerrain reads
                        // this to sample heightfield at both endpoints and
                        // re-orient the rail so it actually spans the slope
                        // between adjacent posts (instead of staying horizontal
                        // and stair-stepping over hills).
                        rail.userData.railSpan = {
                            halfLen: actualSpacing / 2,
                            axis: orientation,   // 'horizontal' = ±x, 'vertical' = ±z
                            geomAxis: 'x',       // GLB rail's long axis is local +X
                            baseY: height
                        };
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
            post.userData.surfaceToTerrain = true;
            group.add(post);
        }

        // Create rails (3 levels). Geometry's long axis is X for horizontal
        // and Z for vertical orientation; tagged geomAxis lets the slope
        // post-process build the right base-axis quaternion.
        const railLevels = [0.5, 1.2, 1.9];
        const geomAxis = orientation === 'horizontal' ? 'x' : 'z';
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
                rail.userData.surfaceToTerrain = true;
                rail.userData.railSpan = {
                    halfLen: actualSpacing / 2,
                    axis: orientation,
                    geomAxis,
                    baseY: level
                };
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
        // Surface gate as one unit so the two posts + arch + threshold stay
        // co-planar on slopes (don't sample per-child or the gate would shear).
        gateGroup.userData.surfaceToTerrain = true;
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

        if (this.useGLBModels && this.models.gateAssembly) {
            const gate = this.cloneModel('gateAssembly');
            if (gate) {
                const authoredWidth = this.models.gateAssembly.userData.authoredWidth || 8;
                const scale = width / authoredWidth;
                gate.scale.setScalar(scale);
                if (orientation === 'vertical') {
                    gate.rotation.y = Math.PI / 2;
                }
                group.add(gate);
                return group;
            }
        }

        if (this.useGLBModels && (this.models.fencePost || this.models.gatePost)) {
            const postModelName = this.models.fencePost ? 'fencePost' : 'gatePost';
            // Gate posts
            const leftPost = this.cloneModel(postModelName);
            const rightPost = this.cloneModel(postModelName);

            if (leftPost && rightPost) {
                leftPost.scale.set(1.2, 1, 1.2);
                rightPost.scale.set(1.2, 1, 1.2);

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
            opacity: 0.18,
            side: THREE.DoubleSide
        });

        const threshold = new THREE.Mesh(thresholdGeometry, thresholdMaterial);
        threshold.rotation.x = -Math.PI / 2;
        threshold.position.y = 0.01; // Slightly above ground to avoid z-fighting
        group.add(threshold);

        // Add edge glow lines
        const edgeMaterial = new THREE.MeshBasicMaterial({
            color: this.lightenColor(color, 0.6),
            transparent: true,
            opacity: 0.5
        });

        const edgeWidth = 0.1;
        const edgeGeometry = new THREE.BoxGeometry(
            orientation === 'horizontal' ? width + 2 : edgeWidth,
            0.03,
            orientation === 'horizontal' ? edgeWidth : width + 2
        );

        // Front edge
        const frontEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        frontEdge.position.y = 0.015;
        frontEdge.position.z = orientation === 'horizontal' ? 1.5 : 0;
        frontEdge.position.x = orientation === 'horizontal' ? 0 : 1.5;
        group.add(frontEdge);

        // Back edge
        const backEdge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        backEdge.position.y = 0.015;
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
     * Build only the gate structure + pasture pen — no perimeter fence.
     * Used by "open" scenes (no walls, just a goal floating on the field).
     * @param {Object} bounds
     * @param {Object} gate
     * @param {Object} pasture
     * @returns {THREE.Group}
     */
    buildGateAndPenOnly(bounds, gate, pasture) {
        const group = new THREE.Group();
        group.name = 'GateAndPen';

        // Free-standing gate at gate.position. Mark as one unit so it
        // surfaces to terrain coplanarly.
        const gateGroup = this.presets.createGateStructure(gate.width, 'horizontal', {});
        gateGroup.position.set(gate.position.x, 0, gate.position.z);
        gateGroup.userData.surfaceToTerrain = true;
        group.add(gateGroup);

        // Pen behind the gate (same geometry as buildSinglePlayerFences,
        // but anchored to the gate position rather than the bounds edge).
        if (pasture) {
            const penWidth = pasture.maxX - pasture.minX;
            const penDepth = pasture.maxZ - pasture.minZ;
            const penCenterX = (pasture.maxX + pasture.minX) / 2;

            const pen = this.presets.createPenStructure({
                width: penWidth,
                depth: penDepth
            }, 'north');
            pen.position.set(penCenterX, 0, gate.position.z);
            group.add(pen);

            // Without a perimeter fence, the pen's front side has only the
            // gate. Add two short border segments flanking the gate to span
            // the full pen width — otherwise sheep walk around the gate.
            const halfPen = penWidth / 2;
            const halfGate = gate.width / 2;
            const flankLength = halfPen - halfGate;
            if (flankLength > 0.5) {
                const gateLeftEdge = gate.position.x - halfGate;
                const gateRightEdge = gate.position.x + halfGate;
                const penLeftEdge = penCenterX - halfPen;
                const penRightEdge = penCenterX + halfPen;

                const leftFlankLen = gateLeftEdge - penLeftEdge;
                if (leftFlankLen > 0.5) {
                    const leftFlank = this.presets.createBorderSegment(leftFlankLen, 'horizontal');
                    leftFlank.position.set(
                        (penLeftEdge + gateLeftEdge) / 2,
                        0,
                        gate.position.z
                    );
                    group.add(leftFlank);
                }

                const rightFlankLen = penRightEdge - gateRightEdge;
                if (rightFlankLen > 0.5) {
                    const rightFlank = this.presets.createBorderSegment(rightFlankLen, 'horizontal');
                    rightFlank.position.set(
                        (gateRightEdge + penRightEdge) / 2,
                        0,
                        gate.position.z
                    );
                    group.add(rightFlank);
                }
            }
        }

        return group;
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
