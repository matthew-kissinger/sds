import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Vector2D } from './Vector2D.js';
import { Boid } from './Boid.js';

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
    constructor(scene, sheepCount = 200) {
        this.scene = scene;
        this.sheepCount = sheepCount;
        this.sheep = [];
        this.audioManager = null;
        
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
        
        // Body - simplified ellipsoid
        const bodyGeometry = new THREE.SphereGeometry(0.8, 12, 8);
        bodyGeometry.scale(1, 0.9, 1.1);
        bodyGeometry.translate(0, 0.7, 0);
        
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
        
        // Head - smaller sphere merged with body
        const headGeometry = new THREE.SphereGeometry(0.35, 10, 6);
        headGeometry.scale(0.8, 0.9, 1.2);
        headGeometry.translate(0, 0.65, 0.65);
        
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
        
        // Create 4 legs as simple cylinders
        const legGeometry = new THREE.CylinderGeometry(0.08, 0.1, 0.5, 6);
        const legPositions = [
            { x: -0.25, z: 0.3 },  // front left
            { x: 0.25, z: 0.3 },   // front right
            { x: -0.25, z: -0.3 }, // back left
            { x: 0.25, z: -0.3 }   // back right
        ];
        
        legPositions.forEach((pos, index) => {
            const leg = legGeometry.clone();
            leg.translate(pos.x, 0.25, pos.z);
            
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
     */
    createOptimizedMaterial() {
        // Vertex shader with GPU animation
        const vertexShader = `
            // Use built-in color attribute from Three.js
            attribute float vertexId;
            
            // Per-instance attributes
            attribute vec4 instanceData; // x: animPhase, y: speed, z: state, w: uniqueId
            attribute vec4 instanceAnimation; // x: walkCycle, y: bounce, z: direction, w: blinkTimer
            
            uniform float time;
            uniform float globalAnimSpeed;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            
            // Animation functions
            vec3 animateVertex(vec3 position, float vId) {
                vec3 animated = position;
                
                float animPhase = instanceData.x;
                float speed = instanceData.y;
                float walkCycle = instanceAnimation.x;
                float bounce = instanceAnimation.y;
                
                // Leg animation (vertexId 100-139)
                if (vId >= 100.0 && vId < 140.0) {
                    float legIndex = floor((vId - 100.0) / 10.0); // 0-3
                    float legPhase = legIndex < 2.0 ? 0.0 : 3.14159; // Front/back offset
                    float sidePhase = mod(legIndex, 2.0) * 1.57; // Left/right offset
                    
                    float legTime = time * globalAnimSpeed + animPhase + walkCycle;
                    float legLift = max(0.0, sin(legTime * 3.0 + legPhase + sidePhase)) * bounce * 2.0;
                    
                    animated.y += legLift * speed;
                    
                    // Slight forward/back motion
                    animated.z += sin(legTime * 3.0 + legPhase + sidePhase) * bounce * 0.3 * speed;
                }
                
                // Body bounce (vertexId 0-49)
                if (vId < 50.0) {
                    float bodyTime = time * globalAnimSpeed + animPhase;
                    animated.y += sin(bodyTime * 2.0) * bounce * 0.5 * speed;
                    
                    // Slight wobble
                    animated.x += sin(bodyTime * 2.5) * bounce * 0.1 * speed;
                }
                
                // Head bob (vertexId 50-99)
                if (vId >= 50.0 && vId < 100.0) {
                    float headTime = time * globalAnimSpeed + animPhase + 0.5;
                    animated.y += sin(headTime * 2.0) * bounce * 0.3 * speed;
                    
                    // Look direction
                    float lookAngle = instanceAnimation.z;
                    animated.x += sin(lookAngle) * 0.1;
                    animated.z += cos(lookAngle) * 0.1;
                }
                
                return animated;
            }
            
            void main() {
                // Access vertex color using built-in Three.js attribute
                #ifdef USE_COLOR
                    vColor = color;
                #else
                    vColor = vec3(1.0); // Default to white if no vertex colors
                #endif
                
                vNormal = normalMatrix * normal;
                
                // Animate vertex position
                vec3 animatedPosition = animateVertex(position, vertexId);
                
                // Apply instance transformation with proper matrix multiplication
                vec4 instancePosition = instanceMatrix * vec4(animatedPosition, 1.0);
                
                vec4 mvPosition = modelViewMatrix * instancePosition;
                vViewPosition = -mvPosition.xyz;
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
        
        // Fragment shader with simple toon shading
        const fragmentShader = `
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            
            uniform vec3 fogColor;
            uniform float fogNear;
            uniform float fogFar;
            
            void main() {
                // Simple toon shading
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(vViewPosition);
                
                // Basic lighting
                vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));
                float NdotL = dot(normal, lightDir);
                
                // Toon shading steps
                float toon = smoothstep(0.0, 0.01, NdotL) * 0.5 + 0.5;
                toon = floor(toon * 3.0) / 3.0;
                
                // Apply vertex color with toon shading
                vec3 finalColor = vColor * toon;
                
                // Apply fog
                float depth = length(vViewPosition);
                float fogFactor = smoothstep(fogNear, fogFar, depth);
                finalColor = mix(finalColor, fogColor, fogFactor);
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;
        
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
        const spreadRadius = 30;
        
        for (let i = 0; i < this.sheepCount; i++) {
            // Random position in a cluster
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spreadRadius;
            const x = -30 + Math.cos(angle) * distance;
            const z = -30 + Math.sin(angle) * distance;
            
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
    update(deltaTime, sheepdog, gate, pasture, bounds, params) {
        const dummy = new THREE.Object3D();
        
        // Update time uniform
        this.material.uniforms.time.value += deltaTime;
        
        // Ensure instance matrix is available
        if (!this.instancedMesh.instanceMatrix) {
            console.warn('Instance matrix not available');
            return;
        }
        
        // Track sheep being chased for group audio
        let sheepBeingChased = 0;
        let shouldPlayGroupBleat = false;
        
        // Update each sheep
        for (let i = 0; i < this.sheepCount; i++) {
            const sheep = this.sheep[i];
            
            // Check if this sheep is being chased (before updating behavior)
            if (sheepdog && sheep.position) {
                const distanceToSheepdog = sheep.position.distanceTo(sheepdog.position);
                const isBeingChased = distanceToSheepdog < sheep.fleeRadius;
                
                if (isBeingChased && !sheep.wasBeingChased) {
                    sheepBeingChased++;
                    shouldPlayGroupBleat = true;
                }
            }
            
            // Update behavior (flocking, movement, etc.)
            sheep.updateBehavior(this.sheep, sheepdog, gate, pasture, bounds, params, false); // Pass false to disable individual bleating
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
     * Reset all sheep to their starting positions and states
     */
    resetAllSheep() {
        const dummy = new THREE.Object3D();
        const spreadRadius = 30;
        
        for (let i = 0; i < this.sheepCount; i++) {
            const sheep = this.sheep[i];
            
            // Reset position to starting area
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * spreadRadius;
            const x = -30 + Math.cos(angle) * distance;
            const z = -30 + Math.sin(angle) * distance;
            
            // Reset sheep state
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
    
    updateBehavior(allSheep, sheepdog, gate, pasture, bounds, params, enableIndividualBleating = true) {
        // If retiring, seek retirement target or graze
        if (this.isRetiring) {
            if (this.retirementTarget) {
                const distanceToTarget = this.position.distanceTo(this.retirementTarget);
                
                if (distanceToTarget < 2) {
                    // Sheep has reached its retirement spot - enter grazing mode
                    this.retirementTarget = null; // Clear target to enter grazing mode
                    this.maxSpeed = 0.02; // Very slow grazing speed
                    this.maxForce = 0.005; // Gentle forces
                    this.state = 2; // Set to grazing state
                } else {
                    // Still moving to retirement spot
                    const seekForce = this.seek(this.retirementTarget);
                    this.applyForce(seekForce);
                }
            } else {
                // Grazing behavior - gentle wandering
                this.animationPhase += 0.016;
                
                // Occasional gentle movement
                if (Math.random() < 0.002) { // 0.2% chance per frame to start moving
                    const wanderDirection = Vector2D.random();
                    wanderDirection.multiply(0.5); // Gentle movement
                    this.applyForce(wanderDirection);
                }
                
                // Stay within pasture bounds with gentle forces
                if (pasture) {
                    const pastureMargin = 2;
                    const steer = new Vector2D(0, 0);
                    
                    if (this.position.x < pasture.minX + pastureMargin) {
                        steer.x = 0.01;
                    } else if (this.position.x > pasture.maxX - pastureMargin) {
                        steer.x = -0.01;
                    }
                    
                    if (this.position.z < pasture.minZ + pastureMargin) {
                        steer.z = 0.01;
                    } else if (this.position.z > pasture.maxZ - pastureMargin) {
                        steer.z = -0.01;
                    }
                    
                    if (steer.magnitude() > 0) {
                        this.applyForce(steer);
                    }
                }
            }
            return;
        }
        
        // Only check gate passage if gate and pasture are available (game is active)
        if (gate && pasture && this.hasPassedGate && !this.isRetiring) {
            this.isRetiring = true;
            this.state = 1; // retiring
            this.retirementTarget = new Vector2D(
                pasture.minX + Math.random() * (pasture.maxX - pasture.minX),
                pasture.centerZ + Math.random() * 20
            );
            this.maxSpeed *= 0.5;
            this.maxForce *= 0.5;
            return;
        }
        
        // Normal flocking behavior (always active)
        this.flock(allSheep, params.separationDistance);
        
        // Add gentle wandering during pre-game state (when no sheepdog)
        if (!sheepdog) {
            // Gentle wandering to make the start screen more lively
            if (Math.random() < 0.01) { // 1% chance per frame for gentle movement
                const wanderDirection = Vector2D.random();
                wanderDirection.multiply(0.3); // Gentle wandering force
                this.applyForce(wanderDirection);
            }
        }
        
        // Flee from sheepdog (only if sheepdog exists - game is active)
        if (sheepdog) {
            const distanceToSheepdog = this.position.distanceTo(sheepdog.position);
            const isBeingChased = distanceToSheepdog < this.fleeRadius;
            
            const fleeForce = this.flee(sheepdog.position, this.fleeRadius);
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
        
        // Gate attraction logic (only if sheepdog and gate exist - game is active)
        if (sheepdog && gate) {
            const distanceToGate = this.position.distanceTo(gate.position);
            const distanceToDog = this.position.distanceTo(sheepdog.position);
            
            if (distanceToDog < this.fleeRadius * 1.5 && distanceToGate < 30) {
                const toGate = gate.position.clone().subtract(this.position);
                const toDog = sheepdog.position.clone().subtract(this.position);
                
                const dotProduct = toGate.x * toDog.x + toGate.z * toDog.z;
                if (dotProduct < 0) {
                    const gateForce = this.seek(gate.position);
                    gateForce.multiply(this.gateAttraction);
                    this.applyForce(gateForce);
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
        
        // HARD BOUNDARY CONSTRAINT - Apply only to sheep that haven't passed the gate
        if (this.bounds && !this.hasPassedGate) {
            const margin = 0.2; // Small margin from edge
            
            // Check if sheep is in the gate area (allow passage through gate)
            const inGateArea = Math.abs(this.position.x) <= 4 && this.position.z >= 98 && this.position.z <= 102;
            
            // Apply hard constraints unless in gate area
            if (!inGateArea) {
                this.position.x = Math.max(this.bounds.minX + margin, Math.min(this.bounds.maxX - margin, this.position.x));
                this.position.z = Math.max(this.bounds.minZ + margin, Math.min(this.bounds.maxZ - margin, this.position.z));
            } else {
                // In gate area - only constrain X to gate width, allow Z movement
                this.position.x = Math.max(-4, Math.min(4, this.position.x));
                // Don't constrain Z in gate area to allow passage
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
    
    // Boundary avoidance that excludes gate area
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
            // Only check for gate if gate exists (game is active)
            const nearGateX = gate ? Math.abs(position.x - gate.position.x) < gate.width / 2 + 2 : false;
            if (!nearGateX) {
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
    
    checkGatePassageAndRetire(gatePassageZone, pastureBounds) {
        if (this.hasPassedGate) return false;
        
        const inGateX = this.position.x >= gatePassageZone.minX && 
                       this.position.x <= gatePassageZone.maxX;
        const inGateZ = this.position.z >= gatePassageZone.minZ && 
                       this.position.z <= gatePassageZone.maxZ;
        
        if (inGateX && inGateZ && this.velocity.z > 0) {
            this.hasPassedGate = true;
            return true;
        }
        
        return false;
    }
    
    setBounds(bounds) {
        this.bounds = bounds;
    }
    
    setAudioManager(audioManager) {
        this.audioManager = audioManager;
    }
} 