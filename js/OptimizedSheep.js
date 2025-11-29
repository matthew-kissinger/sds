import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Vector2D } from './Vector2D.js';
import { Boid } from './Boid.js';
import { loadShader } from './shaders/ShaderLoader.js';
import { getGameState, getNetworkManager } from './GameBridge.js';
import { FieldConfig, GATE_DEFAULTS } from './FieldConfig.js';
import { getFenceCollisionSystem } from './FenceCollisionSystem.js';

// Shader cache for sync access after async load
let sheepVertexShader = null;
let sheepFragmentShader = null;
let shadersLoaded = false;

/**
 * Preload sheep shaders - call this early in app initialization
 */
export async function preloadSheepShaders() {
    if (shadersLoaded) return;

    try {
        [sheepVertexShader, sheepFragmentShader] = await Promise.all([
            loadShader('./js/shaders/sheep/vertex.glsl'),
            loadShader('./js/shaders/sheep/fragment.glsl')
        ]);
        shadersLoaded = true;
        console.log('[SHADER] Sheep shaders loaded');
    } catch (error) {
        console.warn('[SHADER] Failed to load sheep shaders, using inline fallback:', error);
    }
}

/**
 * OptimizedSheep - High-performance sheep system using modern GPU techniques
 * 
 * Features:
 * - Single InstancedMesh for all sheep (1 draw call!)
 * - Merged geometry with vertex colors
 * - GPU-based animation via vertex shader
 * - Efficient per-instance data management
 */

export class OptimizedSheepSystem {
    constructor(scene, sheepCount = 200, spawnConfig = null) {
        this.scene = scene;
        this.sheepCount = sheepCount;
        this.sheep = [];
        this.audioManager = null;

        // Spawn configuration - defaults to center of field with some spread
        this.spawnConfig = spawnConfig || {
            centerX: -30,
            centerZ: -30,
            spreadRadius: 30
        };

        // Create geometry and materials
        this.createMergedGeometry();
        this.createOptimizedMaterial();

        // Create instanced mesh
        this.createInstancedMesh();

        // Initialize sheep data
        this.initializeSheepData();
    }
    
    /**
     * Create merged sheep geometry with vertex colors
     */
    createMergedGeometry() {
        const geometries = [];
        const colors = [];
        
        // Body - simplified ellipsoid (scaled up 1.25x)
        const bodyGeometry = new THREE.SphereGeometry(1.0, 12, 8);
        bodyGeometry.scale(1, 0.9, 1.1);
        bodyGeometry.translate(0, 0.875, 0);
        
        // Add white color for body vertices
        const bodyColors = new Float32Array(bodyGeometry.attributes.position.count * 3);
        for (let i = 0; i < bodyColors.length; i += 3) {
            bodyColors[i] = 1;     // R
            bodyColors[i + 1] = 1; // G
            bodyColors[i + 2] = 1; // B
        }
        bodyGeometry.setAttribute('color', new THREE.BufferAttribute(bodyColors, 3));
        
        // Add vertex IDs for body
        const bodyVertexIds = new Float32Array(bodyGeometry.attributes.position.count);
        for (let i = 0; i < bodyVertexIds.length; i++) {
            bodyVertexIds[i] = Math.min(i, 49); // Body vertices: 0-49
        }
        bodyGeometry.setAttribute('vertexId', new THREE.BufferAttribute(bodyVertexIds, 1));
        geometries.push(bodyGeometry);
        
        // Head - smaller sphere merged with body (scaled up 1.25x)
        const headGeometry = new THREE.SphereGeometry(0.4375, 10, 6);
        headGeometry.scale(0.8, 0.9, 1.2);
        headGeometry.translate(0, 0.8125, 0.8125);
        
        // Add black color for head vertices
        const headColors = new Float32Array(headGeometry.attributes.position.count * 3);
        for (let i = 0; i < headColors.length; i += 3) {
            headColors[i] = 0.16;     // R
            headColors[i + 1] = 0.16; // G
            headColors[i + 2] = 0.16; // B
        }
        headGeometry.setAttribute('color', new THREE.BufferAttribute(headColors, 3));
        
        // Add vertex IDs for head
        const headVertexIds = new Float32Array(headGeometry.attributes.position.count);
        for (let i = 0; i < headVertexIds.length; i++) {
            headVertexIds[i] = 50 + Math.min(i, 49); // Head vertices: 50-99
        }
        headGeometry.setAttribute('vertexId', new THREE.BufferAttribute(headVertexIds, 1));
        geometries.push(headGeometry);
        
        // Create 4 legs as simple cylinders (scaled up 1.25x)
        const legGeometry = new THREE.CylinderGeometry(0.1, 0.125, 0.625, 6);
        const legPositions = [
            { x: -0.3125, z: 0.375 },  // front left (scaled 1.25x)
            { x: 0.3125, z: 0.375 },   // front right (scaled 1.25x)
            { x: -0.3125, z: -0.375 }, // back left (scaled 1.25x)
            { x: 0.3125, z: -0.375 }   // back right (scaled 1.25x)
        ];
        
        legPositions.forEach((pos, index) => {
            const leg = legGeometry.clone();
            leg.translate(pos.x, 0.3125, pos.z); // Y position scaled 1.25x
            
            // Add vertex IDs for animation in shader
            const vertexIds = new Float32Array(leg.attributes.position.count);
            for (let i = 0; i < vertexIds.length; i++) {
                vertexIds[i] = 100 + index * 10; // Leg ID encoding
            }
            leg.setAttribute('vertexId', new THREE.BufferAttribute(vertexIds, 1));
            
            // Black color for legs
            const legColors = new Float32Array(leg.attributes.position.count * 3);
            for (let i = 0; i < legColors.length; i += 3) {
                legColors[i] = 0.16;     // R
                legColors[i + 1] = 0.16; // G
                legColors[i + 2] = 0.16; // B
            }
            leg.setAttribute('color', new THREE.BufferAttribute(legColors, 3));
            
            geometries.push(leg);
        });
        
        // Merge all geometries
        this.mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries);
        
        // Compute bounds for frustum culling
        this.mergedGeometry.computeBoundingBox();
        this.mergedGeometry.computeBoundingSphere();
    }
    
    /**
     * Create optimized material with custom shaders
     * Uses externally loaded shaders if available, falls back to inline
     */
    createOptimizedMaterial() {
        // Use loaded shaders or fallback to inline
        const vertexShader = sheepVertexShader || this.getInlineVertexShader();
        const fragmentShader = sheepFragmentShader || this.getInlineFragmentShader();

        this.material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                time: { value: 0 },
                globalAnimSpeed: { value: 1.0 },
                fogColor: { value: new THREE.Color(0x87CEEB) },
                fogNear: { value: 200 },
                fogFar: { value: 600 }
            },
            vertexColors: true,
            fog: false // We handle fog manually in shader
        });
    }
    
    /**
     * Create the instanced mesh with all sheep
     */
    createInstancedMesh() {
        this.instancedMesh = new THREE.InstancedMesh(
            this.mergedGeometry,
            this.material,
            this.sheepCount
        );
        
        // Enable shadows
        this.instancedMesh.castShadow = true;
        this.instancedMesh.receiveShadow = true;
        
        // Create instance attributes for animation data
        const instanceData = new THREE.InstancedBufferAttribute(
            new Float32Array(this.sheepCount * 4), 4
        );
        const instanceAnimation = new THREE.InstancedBufferAttribute(
            new Float32Array(this.sheepCount * 4), 4
        );
        
        this.mergedGeometry.setAttribute('instanceData', instanceData);
        this.mergedGeometry.setAttribute('instanceAnimation', instanceAnimation);
        
        // Add to scene
        this.scene.add(this.instancedMesh);
        
        // Disable frustum culling so sheep never disappear due to bounding sphere issues
        this.instancedMesh.frustumCulled = false;
    }
    
    /**
     * Initialize individual sheep instances
     */
    initializeSheepData() {
        const dummy = new THREE.Object3D();
        const { centerX, centerZ, spreadRadius, borderPoints } = this.spawnConfig;
        const edgeMargin = 5; // Minimum distance from fence edges

        for (let i = 0; i < this.sheepCount; i++) {
            let x, z;
            let attempts = 0;
            const maxAttempts = 100; // Increased attempts for safer spawning

            // Try to find a valid spawn position inside the polygon with margin from edges
            do {
                // Random position in a cluster around spawn center
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * spreadRadius;
                x = centerX + Math.cos(angle) * distance;
                z = centerZ + Math.sin(angle) * distance;
                attempts++;
            } while (borderPoints && !this.isPointSafelyInside(x, z, borderPoints, edgeMargin) && attempts < maxAttempts);

            // If we couldn't find a safe point, try random positions across the field
            if (attempts >= maxAttempts && borderPoints) {
                // Grid search fallback - find ANY valid point
                let found = false;
                const centroid = this.getPolygonCentroid(borderPoints);

                // Try progressively larger areas around centroid
                for (let searchRadius = 10; searchRadius <= spreadRadius * 2 && !found; searchRadius += 10) {
                    for (let attempt = 0; attempt < 20 && !found; attempt++) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = Math.random() * searchRadius;
                        const testX = centroid.x + Math.cos(angle) * distance;
                        const testZ = centroid.z + Math.sin(angle) * distance;

                        if (this.isPointSafelyInside(testX, testZ, borderPoints, edgeMargin)) {
                            x = testX;
                            z = testZ;
                            found = true;
                        }
                    }
                }

                // Last resort - use centroid even if too close to edge
                if (!found) {
                    x = centroid.x + (Math.random() - 0.5) * 5;
                    z = centroid.z + (Math.random() - 0.5) * 5;
                }
            }

            // Create sheep instance data
            const sheep = new OptimizedSheepInstance(i, x, z);
            this.sheep.push(sheep);

            // Set initial transform
            dummy.position.set(x, 0, z);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, dummy.matrix);

            // Set initial animation data
            this.updateInstanceAttributes(i, sheep);
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Check if a point is inside a polygon using ray casting algorithm
     */
    isPointInPolygon(x, z, points) {
        if (!points || points.length < 3) return true;

        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, zi = points[i].z;
            const xj = points[j].x, zj = points[j].z;

            if (((zi > z) !== (zj > z)) &&
                (x < (xj - xi) * (z - zi) / (zj - zi) + xi)) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Get the centroid of a polygon
     */
    getPolygonCentroid(points) {
        let cx = 0, cz = 0;
        for (const p of points) {
            cx += p.x;
            cz += p.z;
        }
        return { x: cx / points.length, z: cz / points.length };
    }

    /**
     * Calculate distance from a point to a line segment
     */
    pointToSegmentDistance(px, pz, start, end) {
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.sqrt(dx * dx + dz * dz);

        if (length === 0) {
            return Math.sqrt(Math.pow(px - start.x, 2) + Math.pow(pz - start.z, 2));
        }

        const t = Math.max(0, Math.min(1,
            ((px - start.x) * dx + (pz - start.z) * dz) / (length * length)
        ));

        const closestX = start.x + t * dx;
        const closestZ = start.z + t * dz;

        return Math.sqrt(Math.pow(px - closestX, 2) + Math.pow(pz - closestZ, 2));
    }

    /**
     * Check if a point is safely inside the polygon with margin from edges
     */
    isPointSafelyInside(x, z, points, margin = 3) {
        if (!this.isPointInPolygon(x, z, points)) return false;

        // Check distance from all edges
        for (let i = 0; i < points.length; i++) {
            const start = points[i];
            const end = points[(i + 1) % points.length];
            const dist = this.pointToSegmentDistance(x, z, start, end);
            if (dist < margin) return false;
        }
        return true;
    }

    /**
     * Update instance attributes for a specific sheep
     */
    updateInstanceAttributes(index, sheep) {
        const instanceData = this.mergedGeometry.attributes.instanceData;
        const instanceAnimation = this.mergedGeometry.attributes.instanceAnimation;
        
        if (!instanceData || !instanceAnimation) return;
        
        // Instance data: animPhase, speed, state, uniqueId
        instanceData.setXYZW(
            index,
            sheep.animationPhase,
            sheep.currentSpeed,
            sheep.state, // 0: active, 1: retiring, 2: retired
            index
        );
        
        // Animation data: walkCycle, bounce, direction, blinkTimer
        instanceAnimation.setXYZW(
            index,
            sheep.walkCycle,
            sheep.bounceAmount,
            sheep.facingDirection,
            sheep.blinkTimer
        );
        
        instanceData.needsUpdate = true;
        instanceAnimation.needsUpdate = true;
    }
    
    /**
     * Update all sheep behaviors and animations
     */
    update(deltaTime, sheepdog, gate, pasture, bounds, params, enableIndividualBleating = true, isMultiplayer = false, sheepdog2 = null) {
        const dummy = new THREE.Object3D();

        // Update time uniform
        this.material.uniforms.time.value += deltaTime;

        // Ensure instance matrix is available
        if (!this.instancedMesh.instanceMatrix) {
            console.warn('Instance matrix not available');
            return;
        }

        // Store competitive gates reference for sheep to access
        this.competitiveGates = Array.isArray(gate) ? gate : null;

        // Track sheep being chased for group audio
        let sheepBeingChased = 0;
        let shouldPlayGroupBleat = false;

        // Update each sheep
        for (let i = 0; i < this.sheepCount; i++) {
            const sheep = this.sheep[i];

            // Provide competitive gates access to individual sheep
            sheep.competitiveGates = this.competitiveGates;

            // Check if this sheep is being chased (before updating behavior)
            // Check both sheepdogs and respond to the closer one
            if (sheep.position) {
                let closestSheepdogDistance = Infinity;
                let closestSheepdog = null;

                if (sheepdog) {
                    const dist = sheep.position.distanceTo(sheepdog.position);
                    if (dist < closestSheepdogDistance) {
                        closestSheepdogDistance = dist;
                        closestSheepdog = sheepdog;
                    }
                }

                if (sheepdog2) {
                    const dist = sheep.position.distanceTo(sheepdog2.position);
                    if (dist < closestSheepdogDistance) {
                        closestSheepdogDistance = dist;
                        closestSheepdog = sheepdog2;
                    }
                }

                if (closestSheepdog) {
                    const fleeRadius = closestSheepdog.fleeRadius || sheep.fleeRadius || 8;
                    const isBeingChased = closestSheepdogDistance < fleeRadius;

                    if (isBeingChased && !sheep.wasBeingChased) {
                        sheepBeingChased++;
                        shouldPlayGroupBleat = true;
                    }
                }
            }

            // Update behavior (flocking, movement, etc.)
            sheep.updateBehavior(this.sheep, sheepdog, gate, pasture, bounds, params, enableIndividualBleating, isMultiplayer, sheepdog2);
            sheep.updatePosition(deltaTime);
            
            // Update transform matrix using interpolated render position for smooth movement
            dummy.position.set(sheep.renderPosition.x, 0, sheep.renderPosition.z);
            dummy.rotation.y = -sheep.renderFacingDirection + Math.PI / 2;
            
            // Keep all sheep visible - no hiding for grazing sheep
            dummy.scale.set(1, 1, 1);
            
            dummy.updateMatrix();

            // Defensive check for NaN/Infinity in the dummy matrix before setting instanceMatrix
            let matrixIsValid = true;
            for (let j = 0; j < 16; j++) {
                if (isNaN(dummy.matrix.elements[j]) || !isFinite(dummy.matrix.elements[j])) {
                    matrixIsValid = false;
                    break;
                }
            }

            if (matrixIsValid) {
                this.instancedMesh.setMatrixAt(i, dummy.matrix);
            } else {
                console.warn(`Sheep ${sheep.id} produced invalid matrix. Skipping update for this instance.`);
                // Optionally, set to an identity matrix or last known good matrix for this instance
                // For now, we just skip, which means it won't update its visual position/rotation
                // which might make it appear stuck, but it's better than a crash or full invisibility.
            }
            
            // Update animation attributes
            this.updateInstanceAttributes(i, sheep);
        }
        
        // Play group bleat if multiple sheep started being chased this frame
        if (shouldPlayGroupBleat && sheepBeingChased > 0 && this.audioManager) {
            if (sheepBeingChased === 1) {
                this.audioManager.playSheepBleat(); // Single bleat for one sheep
            } else {
                this.audioManager.playGroupSheepBleats(sheepBeingChased); // Layered bleats for multiple sheep
            }
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    
    /**
     * Force update sheep positions for multiplayer mode (no interpolation)
     */
    forceUpdateSheepPositions() {
        const dummy = new THREE.Object3D();
        
        for (let i = 0; i < this.sheepCount; i++) {
            const sheep = this.sheep[i];
            
            // Force render position to match physics position immediately
            sheep.renderPosition.x = sheep.position.x;
            sheep.renderPosition.z = sheep.position.z;
            sheep.renderFacingDirection = sheep.facingDirection;
            
            // Update transform matrix
            dummy.position.set(sheep.renderPosition.x, 0, sheep.renderPosition.z);
            dummy.rotation.y = -sheep.renderFacingDirection + Math.PI / 2;
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            
            this.instancedMesh.setMatrixAt(i, dummy.matrix);
            
            // Update animation attributes
            this.updateInstanceAttributes(i, sheep);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    
    /**
     * Get all sheep instances
     */
    getSheep() {
        return this.sheep;
    }
    
    /**
     * Set audio manager for sound effects
     */
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
        // Pass audio manager to all sheep instances
        this.sheep.forEach(sheep => {
            sheep.setAudioManager(audioManager);
        });
    }

    /**
     * Update spawn configuration for polygon-aware spawning
     * Call this before resetAllSheep() when field shape changes
     */
    setSpawnConfig(spawnConfig) {
        this.spawnConfig = spawnConfig || {
            centerX: -30,
            centerZ: -30,
            spreadRadius: 30
        };
        console.log(`[SHEEP] Updated spawn config: center(${this.spawnConfig.centerX?.toFixed(1)}, ${this.spawnConfig.centerZ?.toFixed(1)}), radius=${this.spawnConfig.spreadRadius?.toFixed(1)}, borderPoints=${this.spawnConfig.borderPoints?.length || 0}`);
    }

    /**
     * Reset all sheep to their starting positions and states
     * Uses the spawnConfig passed during construction for polygon-aware spawning
     */
    resetAllSheep() {
        const dummy = new THREE.Object3D();
        const { centerX, centerZ, spreadRadius, borderPoints } = this.spawnConfig;
        const edgeMargin = 5; // Minimum distance from fence edges

        for (let i = 0; i < this.sheepCount; i++) {
            const sheep = this.sheep[i];

            // Reset position to starting area - use polygon-aware spawning with edge margin
            let x, z;
            let attempts = 0;
            const maxAttempts = 100; // Increased attempts for safer spawning

            // Try to find a valid spawn position inside the polygon with margin from edges
            do {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * spreadRadius;
                x = centerX + Math.cos(angle) * distance;
                z = centerZ + Math.sin(angle) * distance;
                attempts++;
            } while (borderPoints && !this.isPointSafelyInside(x, z, borderPoints, edgeMargin) && attempts < maxAttempts);

            // If we couldn't find a safe point, try expanded search
            if (attempts >= maxAttempts && borderPoints) {
                let found = false;
                const centroid = this.getPolygonCentroid(borderPoints);

                // Try progressively larger areas around centroid
                for (let searchRadius = 10; searchRadius <= spreadRadius * 2 && !found; searchRadius += 10) {
                    for (let attempt = 0; attempt < 20 && !found; attempt++) {
                        const angle = Math.random() * Math.PI * 2;
                        const distance = Math.random() * searchRadius;
                        const testX = centroid.x + Math.cos(angle) * distance;
                        const testZ = centroid.z + Math.sin(angle) * distance;

                        if (this.isPointSafelyInside(testX, testZ, borderPoints, edgeMargin)) {
                            x = testX;
                            z = testZ;
                            found = true;
                        }
                    }
                }

                // Last resort - use centroid
                if (!found) {
                    x = centroid.x + (Math.random() - 0.5) * 5;
                    z = centroid.z + (Math.random() - 0.5) * 5;
                }
            }

            // Reset sheep state - now using the set method
            sheep.position.set(x, z);
            sheep.velocity.set(0, 0);
            sheep.acceleration.set(0, 0);
            sheep.hasPassedGate = false;
            sheep.isRetiring = false;
            sheep.retirementTarget = null;
            sheep.state = 0; // Active state
            sheep.maxSpeed = 0.1;
            sheep.maxForce = 0.02;
            
            // Reset animation properties
            sheep.animationPhase = Math.random() * Math.PI * 2;
            sheep.walkCycle = 0;
            sheep.bounceAmount = 0;
            sheep.currentSpeed = 0;
            sheep.facingDirection = Math.random() * Math.PI * 2;
            sheep.blinkTimer = Math.random() * 5;
            
            // Reset interpolated render position to match physics position
            sheep.renderPosition.set(x, z);
            sheep.renderFacingDirection = sheep.facingDirection;
            
            // Update transform matrix
            dummy.position.set(x, 0, z);
            dummy.rotation.y = sheep.facingDirection;
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, dummy.matrix);
            
            // Update animation attributes
            this.updateInstanceAttributes(i, sheep);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    /**
     * Inline vertex shader fallback (used if external shader fails to load)
     */
    getInlineVertexShader() {
        return `
            attribute float vertexId;
            attribute vec4 instanceData;
            attribute vec4 instanceAnimation;

            uniform float time;
            uniform float globalAnimSpeed;

            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            vec3 animateVertex(vec3 position, float vId) {
                vec3 animated = position;
                float animPhase = instanceData.x;
                float speed = instanceData.y;
                float walkCycle = instanceAnimation.x;
                float bounce = instanceAnimation.y;

                if (vId >= 100.0 && vId < 140.0) {
                    float legIndex = floor((vId - 100.0) / 10.0);
                    float legPhase = legIndex < 2.0 ? 0.0 : 3.14159;
                    float sidePhase = mod(legIndex, 2.0) * 1.57;
                    float legTime = time * globalAnimSpeed + animPhase + walkCycle;
                    float legLift = max(0.0, sin(legTime * 3.0 + legPhase + sidePhase)) * bounce * 2.0;
                    animated.y += legLift * speed;
                    animated.z += sin(legTime * 3.0 + legPhase + sidePhase) * bounce * 0.3 * speed;
                }
                if (vId < 50.0) {
                    float bodyTime = time * globalAnimSpeed + animPhase;
                    animated.y += sin(bodyTime * 2.0) * bounce * 0.5 * speed;
                    animated.x += sin(bodyTime * 2.5) * bounce * 0.1 * speed;
                }
                if (vId >= 50.0 && vId < 100.0) {
                    float headTime = time * globalAnimSpeed + animPhase + 0.5;
                    animated.y += sin(headTime * 2.0) * bounce * 0.3 * speed;
                    float lookAngle = instanceAnimation.z;
                    animated.x += sin(lookAngle) * 0.1;
                    animated.z += cos(lookAngle) * 0.1;
                }
                return animated;
            }

            void main() {
                #ifdef USE_COLOR
                    vColor = color;
                #else
                    vColor = vec3(1.0);
                #endif
                vNormal = normalMatrix * normal;
                vec3 animatedPosition = animateVertex(position, vertexId);
                vec4 instancePosition = instanceMatrix * vec4(animatedPosition, 1.0);
                vec4 mvPosition = modelViewMatrix * instancePosition;
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
    }

    /**
     * Inline fragment shader fallback (used if external shader fails to load)
     */
    getInlineFragmentShader() {
        return `
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            uniform vec3 fogColor;
            uniform float fogNear;
            uniform float fogFar;

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
                float NdotL = dot(normal, lightDir);
                float toon = smoothstep(0.0, 0.01, NdotL) * 0.5 + 0.5;
                toon = floor(toon * 3.0) / 3.0;
                vec3 finalColor = vColor * toon;
                float depth = length(vViewPosition);
                float fogFactor = smoothstep(fogNear, fogFar, depth);
                finalColor = mix(finalColor, fogColor, fogFactor);
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;
    }
}

/**
 * Individual sheep instance data
 */
export class OptimizedSheepInstance extends Boid {
    constructor(id, x, z) {
        super(x, z, {
            maxSpeed: 0.1,
            maxForce: 0.02,
            perceptionRadius: 5
        });
        
        this.id = id;
        this.state = 0; // 0: active, 1: retiring, 2: retired
        
        // Animation properties
        this.animationPhase = Math.random() * Math.PI * 2;
        this.walkCycle = 0;
        this.bounceAmount = 0;
        this.currentSpeed = 0;
        this.facingDirection = 0;
        this.blinkTimer = Math.random() * 5;
        
        // Interpolation properties for smooth visual movement
        this.renderPosition = new Vector2D(x, z); // Smoothed position for rendering
        this.renderFacingDirection = 0; // Smoothed facing direction for rendering
        this.interpolationSpeed = 8.0; // How fast to interpolate (higher = faster catch-up)
        this.rotationInterpolationSpeed = 12.0; // Faster rotation interpolation
        
        // Behavior properties
        this.hasPassedGate = false;
        this.isRetiring = false;
        this.retirementTarget = null;
        this.fleeRadius = 8;
        this.gateAttraction = 0.5;
        this.audioManager = null;
        
        // Audio tracking
        this.wasBeingChased = false;
    }
    
    updateBehavior(allSheep, sheepdog, gate, pasture, bounds, params, enableIndividualBleating = true, isMultiplayer = false, sheepdog2 = null) {
        // If retiring, seek retirement target or graze
        if (this.isRetiring) {
            if (this.retirementTarget) {
                const distanceToTarget = this.position.distanceTo(this.retirementTarget);
                
                if (distanceToTarget < 2) {
                    // Sheep has reached its retirement spot - enter grazing mode
                    this.retirementTarget = null; // Clear target to enter grazing mode
                    this.maxSpeed = 0.03; // Slow but visible grazing speed
                    this.maxForce = 0.008; // Gentle forces
                    this.state = 2; // Set to grazing state
                } else {
                    // Still moving to retirement spot
                    const seekForce = this.seek(this.retirementTarget);
                    this.applyForce(seekForce);
                }
            } else {
                // Grazing behavior - slow wandering around the pasture
                // Slower animation for peaceful grazing
                this.animationPhase += 0.008; // Slower than normal but not too slow
                
                // Create a gentle wandering behavior with more frequent but subtle movement
                if (Math.random() < 0.005) { // 0.5% chance per frame - more frequent wandering
                    const wanderDirection = Vector2D.random();
                    wanderDirection.multiply(0.3); // Gentle but noticeable movement
                    this.applyForce(wanderDirection);
                }
                
                // Add some variation to prevent all sheep moving in sync
                if (Math.random() < 0.001 * (this.id % 3 + 1)) { // Variable timing based on sheep ID
                    // Small directional changes to make movement more natural
                    const changeDirection = Vector2D.random();
                    changeDirection.multiply(0.15);
                    this.applyForce(changeDirection);
                }
                
                // Stay within pasture bounds with gentle steering
                // Use assigned pasture bounds instead of generic pasture
                const assignedPastureBounds = this.getAssignedPastureBounds();
                if (assignedPastureBounds) {
                    const pastureMargin = 3; // Slightly larger margin for more natural movement
                    const steer = new Vector2D(0, 0);
                    
                    if (this.position.x < assignedPastureBounds.minX + pastureMargin) {
                        steer.x = 0.01; // Gentle but effective steering
                    } else if (this.position.x > assignedPastureBounds.maxX - pastureMargin) {
                        steer.x = -0.01;
                    }
                    
                    if (this.position.z < assignedPastureBounds.minZ + pastureMargin) {
                        steer.z = 0.01;
                    } else if (this.position.z > assignedPastureBounds.maxZ - pastureMargin) {
                        steer.z = -0.01;
                    }
                    
                    if (steer.magnitude() > 0) {
                        this.applyForce(steer);
                    }
                }
                
                // Apply drag to keep movement calm and controlled
                this.velocity.multiply(0.95); // Gradual slowdown for peaceful grazing
            }
            return;
        }
        
        // Only check gate passage if gate and pasture are available (game is active)
        if (gate && pasture && this.hasPassedGate && !this.isRetiring) {
            this.isRetiring = true;
            this.state = 1; // retiring

            // Calculate retirement target - account for rotated pastures
            const centerX = (pasture.minX + pasture.maxX) / 2;
            const centerZ = (pasture.minZ + pasture.maxZ) / 2;
            const width = pasture.maxX - pasture.minX;
            const depth = pasture.maxZ - pasture.minZ;

            // Random point in local coordinates (centered at origin)
            const localX = (Math.random() - 0.5) * width * 0.8;  // 80% to stay away from edges
            const localZ = (Math.random() - 0.5) * depth * 0.8;

            // If pasture is rotated, transform local coords to world coords
            let targetX, targetZ;
            if (pasture.edgeAngle && pasture.edgeAngle !== 0) {
                const cos = Math.cos(pasture.edgeAngle);
                const sin = Math.sin(pasture.edgeAngle);
                // Rotate local point by edgeAngle
                targetX = centerX + localX * cos - localZ * sin;
                targetZ = centerZ + localX * sin + localZ * cos;
            } else {
                targetX = centerX + localX;
                targetZ = centerZ + localZ;
            }

            this.retirementTarget = new Vector2D(targetX, targetZ);
            this.maxSpeed *= 0.5;  // Half speed for retiring sheep
            this.maxForce *= 0.5;
            return;
        }
        
        // Normal flocking behavior - only consider active sheep (state 0)
        const activeSheep = allSheep.filter(sheep => sheep.state === 0);
        this.flock(activeSheep, params.separationDistance);
        
        // Add gentle wandering during pre-game state (when no sheepdog)
        if (!sheepdog) {
            // Gentle wandering to make the start screen more lively
            if (Math.random() < 0.01) { // 1% chance per frame for gentle movement
                const wanderDirection = Vector2D.random();
                wanderDirection.multiply(0.3); // Gentle wandering force
                this.applyForce(wanderDirection);
            }
        }
        
        // Flee from sheepdog(s) (only if sheepdog exists - game is active)
        // For local 2-player mode, flee from the closer dog
        if (sheepdog || sheepdog2) {
            // Find the closer sheepdog
            let closestSheepdog = null;
            let closestDistance = Infinity;

            if (sheepdog) {
                const dist = this.position.distanceTo(sheepdog.position);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestSheepdog = sheepdog;
                }
            }

            if (sheepdog2) {
                const dist = this.position.distanceTo(sheepdog2.position);
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closestSheepdog = sheepdog2;
                }
            }

            if (closestSheepdog) {
                // Use closest sheepdog's fleeRadius for dog-specific interaction distances
                const fleeRadius = closestSheepdog.fleeRadius || this.fleeRadius || 8;
                const isBeingChased = closestDistance < fleeRadius;

                const fleeForce = this.flee(closestSheepdog.position, fleeRadius);
                if (fleeForce.magnitude() > 0) {
                    fleeForce.multiply(1.2);
                    this.applyForce(fleeForce);

                    // Play bleat sound when sheep starts being chased (only if individual bleating is enabled)
                    if (isBeingChased && !this.wasBeingChased && this.audioManager && enableIndividualBleating) {
                        this.audioManager.playSheepBleat();
                    }
                }

                this.wasBeingChased = isBeingChased;
            } else {
                this.wasBeingChased = false;
            }
        } else {
            this.wasBeingChased = false;
        }
        
        // Gate attraction logic (only if sheepdog and gate exist - game is active)
        // For local 2-player mode, check attraction based on closest dog
        if ((sheepdog || sheepdog2) && gate) {
            // Handle multiple gates (competitive mode) or single gate (cooperative mode)
            const gates = Array.isArray(gate) ? gate : [gate];

            // Find the closest gate
            let closestGate = null;
            let closestGateDistance = Infinity;

            for (const currentGate of gates) {
                // Create Vector2D from gate position for distance calculation
                const gatePos = new Vector2D(currentGate.position.x, currentGate.position.z);
                const distanceToGate = this.position.distanceTo(gatePos);
                if (distanceToGate < closestGateDistance) {
                    closestGateDistance = distanceToGate;
                    closestGate = currentGate;
                }
            }

            if (closestGate) {
                // Find the closest dog for gate attraction
                let closestDog = null;
                let closestDogDistance = Infinity;

                if (sheepdog) {
                    const dist = this.position.distanceTo(sheepdog.position);
                    if (dist < closestDogDistance) {
                        closestDogDistance = dist;
                        closestDog = sheepdog;
                    }
                }

                if (sheepdog2) {
                    const dist = this.position.distanceTo(sheepdog2.position);
                    if (dist < closestDogDistance) {
                        closestDogDistance = dist;
                        closestDog = sheepdog2;
                    }
                }

                if (closestDog) {
                    // Use closest dog's fleeRadius for dog-specific interaction distances
                    const fleeRadius = closestDog.fleeRadius || this.fleeRadius || 8;

                    if (closestDogDistance < fleeRadius * 1.5 && closestGateDistance < 30) {
                        // Create Vector2D objects from position data
                        const gatePos = new Vector2D(closestGate.position.x, closestGate.position.z);
                        const dogPos = new Vector2D(closestDog.position.x, closestDog.position.z);

                        const toGate = gatePos.clone().subtract(this.position);
                        const toDog = dogPos.clone().subtract(this.position);

                        const dotProduct = toGate.x * toDog.x + toGate.z * toDog.z;
                        if (dotProduct < 0) {
                            const gateForce = this.seek(gatePos);
                            gateForce.multiply(this.gateAttraction);
                            this.applyForce(gateForce);
                        }
                    }
                }
            }
        }
        
        // Boundary avoidance (always active)
        const boundaryForce = this.avoidBoundariesWithGate(bounds, gate);
        this.applyForce(boundaryForce);
        
        this.maxSpeed = params.speed;
        this.cohesionWeight = params.cohesion;
    }
    
    updatePosition(deltaTime) {
        // Standard Boid update
        super.update(deltaTime); // This updates this.position and this.velocity
        
        // HARD BOUNDARY CONSTRAINT - Apply different logic based on sheep state
        // For sandbox mode with polygon shapes, skip rectangular bounds - fence collision handles it
        const fenceSystem = getFenceCollisionSystem();
        const usePolygonBoundary = fenceSystem && fenceSystem.fenceSegments.length > 0 && this.borderPoints;

        if (this.bounds && !usePolygonBoundary) {
            const margin = 0.2; // Small margin from edge

            if (!this.hasPassedGate) {
                // Pre-gate sheep: constrain to main field with gate area exceptions

                // Check if sheep is in any gate area (allow passage through any gate)
                let inAnyGateArea = false;
                let currentGateConstraints = null;

                // Get gate areas dynamically from FieldConfig based on current bounds
                const possibleGateAreas = FieldConfig.getPossibleGateAreas();

                for (const gateArea of possibleGateAreas) {
                    if (this.position.x >= gateArea.minX && this.position.x <= gateArea.maxX &&
                        this.position.z >= gateArea.minZ && this.position.z <= gateArea.maxZ) {
                        inAnyGateArea = true;
                        currentGateConstraints = gateArea;
                        break;
                    }
                }

                // Apply hard constraints unless in gate area
                if (!inAnyGateArea) {
                    this.position.x = Math.max(this.bounds.minX + margin, Math.min(this.bounds.maxX - margin, this.position.x));
                    this.position.z = Math.max(this.bounds.minZ + margin, Math.min(this.bounds.maxZ - margin, this.position.z));
                } else if (currentGateConstraints) {
                    // In gate area - apply gate-specific constraints
                    const gateWidth = currentGateConstraints.maxX - currentGateConstraints.minX;
                    const gateDepth = currentGateConstraints.maxZ - currentGateConstraints.minZ;

                    if (gateWidth > gateDepth) {
                        // Horizontal gate - constrain X to gate width, allow Z movement
                        this.position.x = Math.max(currentGateConstraints.minX, Math.min(currentGateConstraints.maxX, this.position.x));
                    } else {
                        // Vertical gate - constrain Z to gate depth, allow X movement
                        this.position.z = Math.max(currentGateConstraints.minZ, Math.min(currentGateConstraints.maxZ, this.position.z));
                    }
                }
            }
        }

        if (this.bounds) {
            const margin = 0.2;
            if ((this.isRetiring || this.state === 2) && this.hasPassedGate) {
                // Post-gate retiring and grazing sheep: keep them in the appropriate pasture area
                
                // Get the correct pasture bounds based on assigned gate
                const pastureBounds = this.getAssignedPastureBounds(margin);
                
                // Constrain retiring and grazing sheep to stay within their assigned pasture area
                this.position.x = Math.max(pastureBounds.minX + margin, Math.min(pastureBounds.maxX - margin, this.position.x));
                this.position.z = Math.max(pastureBounds.minZ + margin, Math.min(pastureBounds.maxZ - margin, this.position.z));
            }
            // Note: sheep that are not retiring and have passed the gate (state 2, grazing)
            // are already handled by the gentle boundary forces in their behavior update
        }

        // Check collision with internal fences (sandbox mode custom fences and polygon borders)
        if (fenceSystem && fenceSystem.fenceSegments.length > 0) {
            const collision = fenceSystem.resolveCollision(this.position.x, this.position.z, 1.0);
            if (collision.collided) {
                this.position.x = collision.x;
                this.position.z = collision.z;

                // Reflect velocity off the fence
                const dot = this.velocity.x * collision.normalX + this.velocity.z * collision.normalZ;
                if (dot < 0) {
                    // Only reflect if moving toward the fence
                    this.velocity.x -= 1.8 * dot * collision.normalX;
                    this.velocity.z -= 1.8 * dot * collision.normalZ;
                    // Dampen velocity on collision
                    this.velocity.x *= 0.7;
                    this.velocity.z *= 0.7;
                }
            }
        }

        // NaN/Infinity checks for velocity and position
        if (isNaN(this.velocity.x) || isNaN(this.velocity.z) || !isFinite(this.velocity.x) || !isFinite(this.velocity.z)) {
            console.warn(`Sheep ${this.id} velocity became NaN/Infinity:`, this.velocity.x, this.velocity.z);
            this.velocity.set(0, 0); // Reset velocity
        }
        if (isNaN(this.position.x) || isNaN(this.position.z) || !isFinite(this.position.x) || !isFinite(this.position.z)) {
            console.warn(`Sheep ${this.id} position became NaN/Infinity:`, this.position.x, this.position.z);
            // Attempt to reset to a safe position, e.g., center of field, or last known good position
            this.position.set(0, -30); // Reset to initial-like position
            this.velocity.set(0, 0); // Also reset velocity
        }
        
        // Update animation parameters based on movement
        const speed = this.velocity.magnitude();
        
        if (isNaN(speed) || !isFinite(speed)) {
            console.warn(`Sheep ${this.id} speed became NaN/Infinity.`);
            this.currentSpeed = 0;
            this.bounceAmount = 0;
        } else {
            this.currentSpeed = speed / (this.maxSpeed > 0.00001 ? this.maxSpeed : 0.1); // Avoid division by zero for maxSpeed
            this.bounceAmount = Math.min(speed * 15, 0.15);
        }
        
        this.walkCycle += this.currentSpeed * deltaTime * 10; // Use currentSpeed which is now NaN-checked
        
        if (this.currentSpeed > 0.001) {
            this.facingDirection = Math.atan2(this.velocity.z, this.velocity.x);
            if (isNaN(this.facingDirection) || !isFinite(this.facingDirection)) {
                console.warn(`Sheep ${this.id} facingDirection became NaN/Infinity.`);
                this.facingDirection = 0;
            }
        } else {
             // Keep last facing direction if not moving, or default to 0
            // this.facingDirection = this.facingDirection || 0;
        }
        
        // Update blink timer
        this.blinkTimer += deltaTime;
        if (this.blinkTimer > 3 + Math.random() * 4) {
            this.blinkTimer = 0;
        }
        
        // Interpolate render position for smooth visual movement
        this.updateRenderPosition(deltaTime);
    }
    
    /**
     * Update interpolated render position for smooth visual movement
     */
    updateRenderPosition(deltaTime) {
        // Interpolate position smoothly towards actual physics position
        const positionDiff = this.position.clone().subtract(this.renderPosition);
        const interpolationAmount = Math.min(1.0, this.interpolationSpeed * deltaTime);
        
        // Apply position interpolation
        this.renderPosition.add(positionDiff.multiply(interpolationAmount));
        
        // Interpolate facing direction smoothly
        if (this.currentSpeed > 0.001) {
            // Calculate target facing direction from velocity
            const targetFacing = Math.atan2(this.velocity.z, this.velocity.x);
            
            // Handle angle wrapping for smooth rotation
            let angleDiff = targetFacing - this.renderFacingDirection;
            
            // Normalize angle difference to [-π, π]
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            
            // Apply rotation interpolation
            const rotationInterpolationAmount = Math.min(1.0, this.rotationInterpolationSpeed * deltaTime);
            this.renderFacingDirection += angleDiff * rotationInterpolationAmount;
            
            // Normalize final angle
            while (this.renderFacingDirection > Math.PI) this.renderFacingDirection -= 2 * Math.PI;
            while (this.renderFacingDirection < -Math.PI) this.renderFacingDirection += 2 * Math.PI;
        }
    }
    
    // Boundary avoidance that excludes gate area(s)
    avoidBoundariesWithGate(bounds, gate) {
        const margin = 3;
        const steer = new Vector2D(0, 0);
        const position = this.position;
        
        const distToMinX = position.x - bounds.minX;
        const distToMaxX = bounds.maxX - position.x;
        const distToMinZ = position.z - bounds.minZ;
        const distToMaxZ = bounds.maxZ - position.z;
        
        if (distToMinX < margin) {
            const force = (margin - distToMinX) / margin;
            steer.x = this.maxSpeed * force * 1.2;
        } else if (distToMaxX < margin) {
            const force = (margin - distToMaxX) / margin;
            steer.x = -this.maxSpeed * force * 1.2;
        }
        
        if (distToMinZ < margin) {
            const force = (margin - distToMinZ) / margin;
            steer.z = this.maxSpeed * force * 1.2;
        } else if (distToMaxZ < margin) {
            // Check for any nearby gates (handles both single gate and multiple gates)
            let nearAnyGate = false;
            
            if (gate) {
                const gates = Array.isArray(gate) ? gate : [gate];
                
                for (const currentGate of gates) {
                    // Check if sheep is near this gate's X position and at the boundary where the gate is
                    const nearGateX = Math.abs(position.x - currentGate.position.x) < currentGate.width / 2 + 2;
                    const atGateBoundary = Math.abs(position.z - currentGate.position.z) < 5; // Near gate's Z boundary
                    
                    if (nearGateX && atGateBoundary) {
                        nearAnyGate = true;
                        break;
                    }
                }
            }
            
            if (!nearAnyGate) {
                const force = (margin - distToMaxZ) / margin;
                steer.z = -this.maxSpeed * force * 1.2;
            }
        }
        
        if (steer.magnitude() > 0) {
            steer.normalize();
            steer.multiply(this.maxSpeed * 1.5);
            steer.subtract(this.velocity);
            steer.limit(this.maxForce * 2.5);
        }
        
        return steer;
    }
    
    checkGatePassageAndRetire(gateOrPassageZone, pastureBounds) {
        if (this.hasPassedGate) return false;
        
        // Early return if no gate data provided
        if (!gateOrPassageZone) {
            return false;
        }
        
        // Handle both single gate passage zone and array of gates
        let gatesWithZones = [];
        
        if (Array.isArray(gateOrPassageZone)) {
            // Multiple gates (competitive mode)
            gatesWithZones = gateOrPassageZone
                .filter(gate => gate && gate.position) // Filter out undefined/null gates
                .map(gate => {
                    let passageZone;
                    if (gate.passageZone) {
                        passageZone = gate.passageZone;
                    } else {
                        // Create passage zone from gate position and width
                        const width = gate.width || 8;
                        const depth = gate.depth || 4;
                        passageZone = {
                            minX: gate.position.x - width/2,
                            maxX: gate.position.x + width/2,
                            minZ: gate.position.z - depth/2,
                            maxZ: gate.position.z + depth/2
                        };
                    }
                    return {
                        passageZone,
                        direction: gate.direction || null, // Include gate direction
                        gate: gate
                    };
                });
        } else if (gateOrPassageZone && gateOrPassageZone.passageZone) {
            // Single gate object with passage zone
            gatesWithZones = [{
                passageZone: gateOrPassageZone.passageZone,
                direction: gateOrPassageZone.direction || null,
                gate: gateOrPassageZone
            }];
        } else if (gateOrPassageZone && gateOrPassageZone.position) {
            // Single gate object without passage zone - create it
            const width = gateOrPassageZone.width || 8;
            const depth = gateOrPassageZone.depth || 4;
            gatesWithZones = [{
                passageZone: {
                    minX: gateOrPassageZone.position.x - width/2,
                    maxX: gateOrPassageZone.position.x + width/2,
                    minZ: gateOrPassageZone.position.z - depth/2,
                    maxZ: gateOrPassageZone.position.z + depth/2
                },
                direction: gateOrPassageZone.direction || null,
                gate: gateOrPassageZone
            }];
        } else if (gateOrPassageZone) {
            // Legacy: single passage zone object
            gatesWithZones = [{
                passageZone: gateOrPassageZone,
                direction: 'north', // Default to north for legacy
                gate: null
            }];
        } else {
            // No valid gate data
            return false;
        }
        
        // Safety check - if no valid gates, return false
        if (!gatesWithZones || gatesWithZones.length === 0) {
            return false;
        }
        
        // Check if sheep passes through any gate
        for (let i = 0; i < gatesWithZones.length; i++) {
            const gateData = gatesWithZones[i];
            const passageZone = gateData.passageZone;

            // Additional safety check for each passage zone
            if (!passageZone) continue;

            // PRIMARY CHECK: Is sheep in the passage zone (gate opening)?
            const inGateX = this.position.x >= passageZone.minX &&
                           this.position.x <= passageZone.maxX;
            const inGateZ = this.position.z >= passageZone.minZ &&
                           this.position.z <= passageZone.maxZ;

            // Check if sheep is moving through the gate
            let movingThroughGate = false;

            if (gateData.direction) {
                // Use explicit gate direction if available
                switch (gateData.direction) {
                    case 'north':
                        movingThroughGate = this.velocity.z > 0;
                        break;
                    case 'south':
                        movingThroughGate = this.velocity.z < 0;
                        break;
                    case 'east':
                        movingThroughGate = this.velocity.x > 0;
                        break;
                    case 'west':
                        movingThroughGate = this.velocity.x < 0;
                        break;
                    case 'southeast':
                        movingThroughGate = this.velocity.x > 0 && this.velocity.z < 0;
                        break;
                    case 'southwest':
                        movingThroughGate = this.velocity.x < 0 && this.velocity.z < 0;
                        break;
                    default:
                        // Fallback to velocity magnitude check
                        movingThroughGate = this.velocity.magnitude() > 0;
                }
            } else {
                // Fallback: determine gate orientation based on passage zone dimensions
                const gateWidth = passageZone.maxX - passageZone.minX;
                const gateDepth = passageZone.maxZ - passageZone.minZ;

                if (gateWidth > gateDepth) {
                    // Horizontal gate (wider than deep) - check Z velocity
                    movingThroughGate = Math.abs(this.velocity.z) > 0;
                } else {
                    // Vertical gate (deeper than wide) - check X velocity
                    movingThroughGate = Math.abs(this.velocity.x) > 0;
                }
            }

            // If sheep is in passage zone and moving through, they've passed
            if (inGateX && inGateZ && movingThroughGate) {
                this.hasPassedGate = true;
                this.assignedGate = i; // Track which gate was used

                // If gate has an ID, use that instead
                if (gateData.gate && gateData.gate.id !== undefined) {
                    this.assignedGate = gateData.gate.id;
                }

                return true;
            }

            // SECONDARY CHECK: For sandbox mode with rotated pastures, also check pasture bounds
            if (pastureBounds && pastureBounds.edgeAngle !== undefined && pastureBounds.edgeAngle !== 0) {
                // Rotated pasture - transform sheep position to pasture's local coordinates
                const centerX = (pastureBounds.minX + pastureBounds.maxX) / 2;
                const centerZ = (pastureBounds.minZ + pastureBounds.maxZ) / 2;
                const width = pastureBounds.maxX - pastureBounds.minX;
                const depth = pastureBounds.maxZ - pastureBounds.minZ;

                // Offset from pasture center
                const dx = this.position.x - centerX;
                const dz = this.position.z - centerZ;

                // Rotate point by -edgeAngle to align with pasture's local frame
                const cosAngle = Math.cos(-pastureBounds.edgeAngle);
                const sinAngle = Math.sin(-pastureBounds.edgeAngle);
                const localX = dx * cosAngle - dz * sinAngle;
                const localZ = dx * sinAngle + dz * cosAngle;

                // Check if in rotated pasture bounds
                if (Math.abs(localX) <= width / 2 && Math.abs(localZ) <= depth / 2) {
                    this.hasPassedGate = true;
                    this.assignedGate = i;

                    if (gateData.gate && gateData.gate.id !== undefined) {
                        this.assignedGate = gateData.gate.id;
                    }

                    return true;
                }
            }
        }
        
        return false;
    }
    
    setBounds(bounds) {
        this.bounds = bounds;
    }

    setBorderPoints(borderPoints) {
        this.borderPoints = borderPoints;
    }
    
    /**
     * Get the pasture bounds for the gate this sheep was assigned to
     * @param {number} margin - Boundary margin
     * @returns {Object} - Pasture bounds {minX, maxX, minZ, maxZ}
     */
    getAssignedPastureBounds(margin = 0.2) {
        // Try to get competitive gates from global game instance
        const competitiveGates = this.getCompetitiveGates();
        
        // If we have an assigned gate and competitive gates are available, use the specific pasture
        if (this.assignedGate !== null && this.assignedGate !== undefined && competitiveGates && competitiveGates.length > 0) {
            // Find the gate this sheep was assigned to
            const assignedGate = competitiveGates.find(gate => gate.id === this.assignedGate);
            
            if (assignedGate && assignedGate.pasture) {
                return {
                    minX: assignedGate.pasture.minX,
                    maxX: assignedGate.pasture.maxX,
                    minZ: assignedGate.pasture.minZ,
                    maxZ: assignedGate.pasture.maxZ
                };
            }
        }
        
        // Fallback: use gameState pasture for cooperative/sandbox modes
        const gameState = getGameState();
        if (gameState?.pasture) {
            return {
                minX: gameState.pasture.minX,
                maxX: gameState.pasture.maxX,
                minZ: gameState.pasture.minZ,
                maxZ: gameState.pasture.maxZ
            };
        }

        // Ultimate fallback: use FieldConfig pasture (should rarely hit this)
        const pasture = FieldConfig.getPasture();
        if (pasture) {
            return {
                minX: pasture.minX,
                maxX: pasture.maxX,
                minZ: pasture.minZ,
                maxZ: pasture.maxZ
            };
        }

        // Absolute last resort with generic values
        return {
            minX: -30,
            maxX: 30,
            minZ: 102,
            maxZ: 125
        };
    }
    
    /**
     * Get competitive gates from the global game instance
     * @returns {Array|null} - Array of competitive gates or null if not available
     */
    getCompetitiveGates() {
        // First, try local reference set by the OptimizedSheepSystem
        if (this.competitiveGates && Array.isArray(this.competitiveGates)) {
            return this.competitiveGates;
        }
        
        // Try to access competitive gates through various possible paths
        const gameState = getGameState();
        const networkManager = getNetworkManager();

        // Try gameState.competitiveGates first
        if (gameState?.competitiveGates) {
            return gameState.competitiveGates;
        }

        // Try networkManager.currentRoom for multiplayer
        if (networkManager?.currentRoom?.competitiveGates) {
            return networkManager.currentRoom.competitiveGates;
        }

        // Try getting from the latest game state if in multiplayer
        if (networkManager?.latestGameState?.competitive?.gates) {
            return networkManager.latestGameState.competitive.gates;
        }
        
        return null;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }
}
