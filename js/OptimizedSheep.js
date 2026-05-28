import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Vector2D } from './Vector2D.js';
import { Boid } from './Boid.js';
import { loadShader } from './shaders/ShaderLoader.js';
import { getGameState, getNetworkManager } from './GameBridge.js';
import { FieldConfig, GATE_DEFAULTS } from './FieldConfig.js';
import { getFenceCollisionSystem } from './FenceCollisionSystem.js';
import { getExtremeBoidSystem } from './ExtremeBoidSystem.js';
import { geometryTriangleCount } from './utils/TriangleCount.js';
import { createKonveyorSheepMaterial } from './konveyorSheepMaterialAdapter.js';
import { obstacleAvoidance } from '../shared/SceneObstacles.js';

// Cycle 6 Phase 2 — sheep obstacle avoidance.
//   - 30m query radius matches the cycle-6 plan budget (kdbush O(log N + k)).
//   - Strength 6.0 tuned so a sheep arriving at a trunk visibly veers ~1m
//     before contact instead of slipping through. Tune in playtest if it
//     fluttters.
//   - Sheep "radius" treated as 0.6m (existing convention from MovementPhysics).
const SHEEP_OBSTACLE_QUERY_RADIUS = 30;
const SHEEP_OBSTACLE_STRENGTH = 6.0;
const SHEEP_RADIUS = 0.6;

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
    constructor(scene, sheepCount = 200, spawnConfig = null, useExtremeBoids = false, opts = {}) {
        this.scene = scene;
        this.sheepCount = sheepCount;
        this.sheep = [];
        this.audioManager = null;
        /** @type {import('../shared/terrain/Heightfield.js').Heightfield | null} */
        this.heightfield = opts.heightfield ?? null;
        this.konveyorSheepSearch = opts.search;
        this.konveyorSheepFactories = opts.konveyorSheepFactories;
        this.konveyorSheepMaterialSummary = null;
        this.konveyorSheepMaterialControls = null;
        this.animationUpdateRate = 1;
        this._animationUpdateFrame = 0;

        // Extreme boids optimization flag
        this.useExtremeBoids = useExtremeBoids;
        this.extremeBoidSystemInitialized = false;

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

        // ===== BODY ===== (12x8 segments = ~192 tris)
        const bodyGeometry = new THREE.SphereGeometry(1.0, 12, 8);
        bodyGeometry.scale(1, 0.9, 1.1);
        bodyGeometry.translate(0, 0.875, 0);

        const bodyColors = new Float32Array(bodyGeometry.attributes.position.count * 3);
        for (let i = 0; i < bodyColors.length; i += 3) {
            bodyColors[i] = 1;
            bodyColors[i + 1] = 1;
            bodyColors[i + 2] = 1;
        }
        bodyGeometry.setAttribute('color', new THREE.BufferAttribute(bodyColors, 3));

        const bodyVertexIds = new Float32Array(bodyGeometry.attributes.position.count);
        for (let i = 0; i < bodyVertexIds.length; i++) {
            bodyVertexIds[i] = Math.min(i, 49);
        }
        bodyGeometry.setAttribute('vertexId', new THREE.BufferAttribute(bodyVertexIds, 1));
        geometries.push(bodyGeometry);

        // ===== HEAD ===== (10x6 segments = ~120 tris) - Cute cartoon style
        const headGeometry = new THREE.SphereGeometry(0.45, 10, 6);
        headGeometry.scale(0.85, 0.9, 1.0);
        headGeometry.translate(0, 0.88, 0.85);

        const headColors = new Float32Array(headGeometry.attributes.position.count * 3);
        for (let i = 0; i < headColors.length; i += 3) {
            headColors[i] = 0.22;
            headColors[i + 1] = 0.2;
            headColors[i + 2] = 0.18;
        }
        headGeometry.setAttribute('color', new THREE.BufferAttribute(headColors, 3));

        const headVertexIds = new Float32Array(headGeometry.attributes.position.count);
        for (let i = 0; i < headVertexIds.length; i++) {
            headVertexIds[i] = 50 + Math.min(i, 49);
        }
        headGeometry.setAttribute('vertexId', new THREE.BufferAttribute(headVertexIds, 1));
        geometries.push(headGeometry);

        // ===== LEGS ===== (6 segments each = ~24 tris x 4 = ~96 tris) - Stubby cartoon style
        const legGeometry = new THREE.CylinderGeometry(0.11, 0.13, 0.55, 6);
        const legPositions = [
            { x: -0.32, z: 0.42 },
            { x: 0.32, z: 0.42 },
            { x: -0.32, z: -0.42 },
            { x: 0.32, z: -0.42 }
        ];

        legPositions.forEach((pos, index) => {
            const leg = legGeometry.clone();
            leg.translate(pos.x, 0.275, pos.z);

            const vertexIds = new Float32Array(leg.attributes.position.count);
            for (let i = 0; i < vertexIds.length; i++) {
                vertexIds[i] = 100 + index * 10;
            }
            leg.setAttribute('vertexId', new THREE.BufferAttribute(vertexIds, 1));

            const legColors = new Float32Array(leg.attributes.position.count * 3);
            for (let i = 0; i < legColors.length; i += 3) {
                legColors[i] = 0.16;
                legColors[i + 1] = 0.16;
                legColors[i + 2] = 0.16;
            }
            leg.setAttribute('color', new THREE.BufferAttribute(legColors, 3));

            geometries.push(leg);
        });

        // ===== EYES ===== - White eye with black pupil and glint
        const eyeY = 0.94;
        const eyeZ = 1.28;
        const eyeSpacing = 0.14;

        [-1, 1].forEach(side => {
            // White part of eye (sclera)
            const eyeWhite = new THREE.SphereGeometry(0.08, 6, 4);
            eyeWhite.scale(1.0, 1.1, 0.45);
            eyeWhite.translate(side * eyeSpacing, eyeY, eyeZ);

            const eyeWhiteColors = new Float32Array(eyeWhite.attributes.position.count * 3);
            const eyeWhiteVertexIds = new Float32Array(eyeWhite.attributes.position.count);
            for (let i = 0; i < eyeWhite.attributes.position.count; i++) {
                eyeWhiteColors[i * 3] = 0.95;
                eyeWhiteColors[i * 3 + 1] = 0.95;
                eyeWhiteColors[i * 3 + 2] = 0.95;
                eyeWhiteVertexIds[i] = 50 + i; // Head vertex range so eyes move with head
            }
            eyeWhite.setAttribute('color', new THREE.BufferAttribute(eyeWhiteColors, 3));
            eyeWhite.setAttribute('vertexId', new THREE.BufferAttribute(eyeWhiteVertexIds, 1));
            geometries.push(eyeWhite);

            // Black pupil
            const pupil = new THREE.SphereGeometry(0.04, 5, 3);
            pupil.scale(1.0, 1.1, 0.5);
            pupil.translate(side * eyeSpacing, eyeY, eyeZ + 0.025);

            const pupilColors = new Float32Array(pupil.attributes.position.count * 3);
            const pupilVertexIds = new Float32Array(pupil.attributes.position.count);
            for (let i = 0; i < pupil.attributes.position.count; i++) {
                pupilColors[i * 3] = 0.02;
                pupilColors[i * 3 + 1] = 0.02;
                pupilColors[i * 3 + 2] = 0.02;
                pupilVertexIds[i] = 50 + i;
            }
            pupil.setAttribute('color', new THREE.BufferAttribute(pupilColors, 3));
            pupil.setAttribute('vertexId', new THREE.BufferAttribute(pupilVertexIds, 1));
            geometries.push(pupil);

            // White glint/highlight
            const shine = new THREE.SphereGeometry(0.018, 4, 3);
            shine.translate(side * eyeSpacing + side * 0.015, eyeY + 0.025, eyeZ + 0.045);

            const shineColors = new Float32Array(shine.attributes.position.count * 3);
            const shineVertexIds = new Float32Array(shine.attributes.position.count);
            for (let i = 0; i < shine.attributes.position.count; i++) {
                shineColors[i * 3] = 1;
                shineColors[i * 3 + 1] = 1;
                shineColors[i * 3 + 2] = 1;
                shineVertexIds[i] = 50 + i;
            }
            shine.setAttribute('color', new THREE.BufferAttribute(shineColors, 3));
            shine.setAttribute('vertexId', new THREE.BufferAttribute(shineVertexIds, 1));
            geometries.push(shine);
        });

        // ===== NOSE ===== (6x4 segments = ~48 tris) - Cute pink nose
        const nose = new THREE.SphereGeometry(0.05, 6, 4);
        nose.scale(1.2, 0.75, 0.4);
        nose.translate(0, 0.8, 1.3);

        const noseColors = new Float32Array(nose.attributes.position.count * 3);
        const noseVertexIds = new Float32Array(nose.attributes.position.count);
        for (let i = 0; i < nose.attributes.position.count; i++) {
            noseColors[i * 3] = 0.85;
            noseColors[i * 3 + 1] = 0.5;
            noseColors[i * 3 + 2] = 0.55;
            noseVertexIds[i] = 50 + i; // Head vertex range so nose moves with head
        }
        nose.setAttribute('color', new THREE.BufferAttribute(noseColors, 3));
        nose.setAttribute('vertexId', new THREE.BufferAttribute(noseVertexIds, 1));
        geometries.push(nose);

        // Merge all geometries
        // Total: ~192 + 120 + 96 + 96 + 48 = ~552 tris per sheep
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

        const uniforms = {
            time: { value: 0 },
            globalAnimSpeed: { value: 1.0 },
            // Synced to scene.fog every frame in update() so sheep fade
            // to the same horizon color as the terrain. Initial values
            // are placeholders — Atmosphere overwrites them per-frame.
            fogColor: { value: new THREE.Color(0xcccccc) },
            fogDensity: { value: 0.0006 }
        };
        const createDefaultMaterial = () => new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
            vertexColors: true,
            fog: false // We handle fog manually in shader (synced to scene.fog)
        });
        const materialResult = createKonveyorSheepMaterial('sheep-wool', 'createSheepMaterial', {
            createDefaultMaterial,
            search: this.konveyorSheepSearch,
            factories: this.konveyorSheepFactories,
            context: {
                sheepCount: this.sheepCount,
                vertexShader,
                fragmentShader,
                uniforms,
                colors: {
                    body: new THREE.Color(0xffffff),
                    face: new THREE.Color(0.22, 0.20, 0.18),
                    hoof: new THREE.Color(0.16, 0.16, 0.16),
                },
                lighting: {
                    direction: new THREE.Vector3(0.3, 1.0, 0.5),
                    rimColor: new THREE.Color(1.0, 1.0, 1.0),
                    sssColor: new THREE.Color(1.0, 1.0, 0.98),
                },
                wool: {
                    noiseScale: 0.78,
                    displacementStrength: 0.065,
                    breathingStrength: 0.012,
                },
                fog: {
                    color: uniforms.fogColor.value.clone(),
                    near: 18,
                    far: 92,
                },
                material: {
                    vertexColors: true,
                    fog: false,
                },
                geometry: {
                    vertexCount: this.mergedGeometry.attributes.position.count,
                    triangleCount: geometryTriangleCount(this.mergedGeometry),
                    vertexAttributes: Object.keys(this.mergedGeometry.attributes),
                    instanceAttributes: ['instanceData', 'instanceAnimation'],
                },
            },
        });
        this.material = materialResult.material;
        this.material.userData = this.material.userData ?? {};
        this.material.userData.konveyorSheepMaterialControls =
            materialResult.controls ?? this.material.userData.konveyorSheepMaterialControls ?? null;
        this.material.userData.konveyorSheepMaterialSummary = materialResult.summary;
        this.konveyorSheepMaterialSummary = materialResult.summary;
        this.konveyorSheepMaterialControls = this.material.userData.konveyorSheepMaterialControls;
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
        dummy.rotation.order = 'YXZ';
        const {
            centerX, centerZ, spreadRadius, borderPoints, clusterCenters, maxRadius,
            defaultCount
        } = this.spawnConfig;
        const edgeMargin = 5; // Minimum distance from fence edges
        // Cycle 8 Phase 2: cluster + density-aware spawn.
        // Strategy:
        //   1) Use clusterCenters when provided (Open Country has 8 ring clusters);
        //      otherwise fall back to a single (centerX, centerZ).
        //   2) For counts <= per-cluster default, keep spreadRadius unchanged so
        //      Field/RH/OC at their authored default counts spawn identically to
        //      pre-Cycle-8 behaviour (sim-baseline byte-identical for Field 200).
        //   3) For higher counts (Extreme/Insane/Chaos), scale per-cluster radius
        //      by sqrt(count / scaledDefault) to hold the configured density. Cap
        //      at maxRadius derived from scene boundary so spawns stay on land.
        // Pre-Cycle-8 the radius was fixed regardless of count, so 3000-5000
        // sheep stacked into a 25-60m disc — boid spatial hash thrashed and the
        // run "didn't work".
        const sceneClusters = (clusterCenters && clusterCenters.length > 0)
            ? clusterCenters
            : [{ x: centerX, z: centerZ }];
        const baseCount = defaultCount && defaultCount > 0 ? defaultCount : 200;
        const perClusterDefault = baseCount / sceneClusters.length;
        const perClusterActual = this.sheepCount / sceneClusters.length;
        let effectiveRadius = spreadRadius;
        if (perClusterActual > perClusterDefault) {
            const scale = Math.sqrt(perClusterActual / perClusterDefault);
            effectiveRadius = spreadRadius * scale;
        }
        if (maxRadius && effectiveRadius > maxRadius) {
            effectiveRadius = maxRadius;
        }
        if (effectiveRadius !== spreadRadius) {
            console.log(`[SHEEP] Density-scaled spawn radius: base=${spreadRadius.toFixed(1)} effective=${effectiveRadius.toFixed(1)} (count=${this.sheepCount}, clusters=${sceneClusters.length}, defaultCount=${baseCount})`);
        }

        for (let i = 0; i < this.sheepCount; i++) {
            const cluster = sceneClusters[i % sceneClusters.length];
            const clusterCx = cluster.x;
            const clusterCz = cluster.z;
            let x, z;
            let attempts = 0;
            const maxAttempts = 100; // Increased attempts for safer spawning

            // Try to find a valid spawn position inside the polygon with margin from edges
            do {
                // Random position in a cluster around the chosen center
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * effectiveRadius;
                x = clusterCx + Math.cos(angle) * distance;
                z = clusterCz + Math.sin(angle) * distance;
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
            const initY = this._surfaceY(x, z);
            dummy.position.set(x, initY, z);
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

    setAnimationRate(rate = 1) {
        this.animationUpdateRate = Number.isFinite(rate)
            ? THREE.MathUtils.clamp(rate, 0.25, 1)
            : 1;
    }
    
    /**
     * Enable or disable the extreme boid optimization system
     */
    setUseExtremeBoids(enabled, bounds = null) {
        this.useExtremeBoids = enabled;
        if (enabled && bounds) {
            const extremeSystem = getExtremeBoidSystem();
            extremeSystem.enable(this.sheep, bounds);
            this.extremeBoidSystemInitialized = true;
            console.log('[OptimizedSheepSystem] Extreme boid system enabled');
        } else if (!enabled) {
            const extremeSystem = getExtremeBoidSystem();
            extremeSystem.disable();
            this.extremeBoidSystemInitialized = false;
            console.log('[OptimizedSheepSystem] Extreme boid system disabled');
        }
    }

    /**
     * Update all sheep behaviors and animations
     */
    update(deltaTime, sheepdog, gate, pasture, bounds, params, enableIndividualBleating = true, isMultiplayer = false, sheepdog2 = null) {
        const dummy = new THREE.Object3D();
        dummy.rotation.order = 'YXZ';

        const sceneFog = this.scene && this.scene.fog;
        if (this.konveyorSheepMaterialControls?.update) {
            this.konveyorSheepMaterialControls.update({
                deltaTime,
                sceneFog,
                material: this.material,
            });
        } else if (this.material?.uniforms) {
            if (this.material.uniforms.time) {
                this.material.uniforms.time.value += deltaTime;
            }

            // Sync fog to scene.fog so distant sheep fade to the same horizon
            // color as the terrain (Atmosphere updates scene.fog.color per
            // frame from the sky's horizon). Supports FogExp2 (current) and
            // falls back gracefully for legacy linear THREE.Fog.
            if (sceneFog) {
                this.material.uniforms.fogColor?.value.copy(sceneFog.color);
                if (sceneFog.isFogExp2 && this.material.uniforms.fogDensity) {
                    this.material.uniforms.fogDensity.value = sceneFog.density;
                } else if (sceneFog.isFog && this.material.uniforms.fogDensity) {
                    // Approximate linear fog as an FogExp2 density that hits
                    // ~95% opacity at `far`. exp(-d*d*far*far)=0.05 → d≈sqrt(3)/far.
                    this.material.uniforms.fogDensity.value = 1.732 / Math.max(1, sceneFog.far);
                }
            }
        }

        // Ensure instance matrix is available
        if (!this.instancedMesh.instanceMatrix) {
            console.warn('Instance matrix not available');
            return;
        }

        // Initialize extreme boid system if needed (first update with bounds)
        if (this.useExtremeBoids && !this.extremeBoidSystemInitialized && bounds) {
            const extremeSystem = getExtremeBoidSystem();
            extremeSystem.enable(this.sheep, bounds);
            extremeSystem.setParams(params);
            this.extremeBoidSystemInitialized = true;
            console.log('[OptimizedSheepSystem] Extreme boid system auto-initialized');
        }

        // Use extreme boid system for flocking calculations if enabled
        if (this.useExtremeBoids && this.extremeBoidSystemInitialized) {
            const extremeSystem = getExtremeBoidSystem();
            extremeSystem.setParams(params);
            extremeSystem.update(this.sheep, deltaTime);
        }

        // Store competitive gates reference for sheep to access
        this.competitiveGates = Array.isArray(gate) ? gate : null;

        // Track sheep being chased for group audio
        let sheepBeingChased = 0;
        let shouldPlayGroupBleat = false;

        // Determine if we're in high-difficulty solo modes (extreme/insane).
        // Sandbox can enable extreme boids for performance, but should not inherit difficulty tweaks.
        const gameState = getGameState();
        const isHighDifficultyMode = gameState?.gameMode === 'solo' &&
            (gameState.singlePlayerMode === 'extreme' || gameState.singlePlayerMode === 'insane');

        const animationUpdateStride = Math.max(1, Math.round(1 / this.animationUpdateRate));
        const animationFrame = this._animationUpdateFrame;

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
            // Pass skipFlocking=true when extreme boid system handles flocking
            sheep.updateBehavior(
                this.sheep,
                sheepdog,
                gate,
                pasture,
                bounds,
                params,
                enableIndividualBleating,
                isMultiplayer,
                sheepdog2,
                this.useExtremeBoids && this.extremeBoidSystemInitialized,
                isHighDifficultyMode
            );
            sheep.updatePosition(deltaTime);

            // Cycle 5+ corral ascend: float upward along the lightning bolt,
            // shrink as it rises, dispatch a spark event at the top.
            // Cycle 7: ascend height matched to BOLT_HEIGHT (60m) so the
            // sheep traces the entire bolt before vanishing — was 22m
            // (too short, sheep visibly stopped at 1/3 the bolt's reach).
            // Position is locked to ascendStart{X,Z} from the zap moment
            // so any residual physics doesn't drift the sheep sideways.
            if (sheep.isAscending) {
                const ASCEND_DURATION = 1.8;  // seconds — matches bolt fade window
                const ASCEND_HEIGHT = 60;     // metres up — matches BOLT_HEIGHT
                sheep.ascendT = Math.min(1, (sheep.ascendT || 0) + deltaTime / ASCEND_DURATION);
                const t = sheep.ascendT;
                // Ease-in cubic so the sheep takes off fast (yanked by the
                // bolt) and decelerates near the top — reads as "pulled
                // upward" rather than "drifting off".
                const easedT = t * t * (3 - 2 * t); // smoothstep — symmetric in/out
                const sx = sheep.ascendStartX ?? sheep.position.x;
                const sz = sheep.ascendStartZ ?? sheep.position.z;
                const baseY = this._surfaceY(sx, sz);
                const ascendY = baseY + 0.5 + easedT * ASCEND_HEIGHT;
                dummy.position.set(sx, ascendY, sz);
                dummy.rotation.set(0, 0, 0);
                // Shrink continuously across the ascent — by ~50% at half-
                // way, near zero by the top. Reads as the sheep being
                // "pulled into" the lightning, not floating up at full size.
                const scale = Math.max(0, 1 - t * t);
                dummy.scale.set(scale, scale, scale);
                dummy.updateMatrix();
                this.instancedMesh.setMatrixAt(i, dummy.matrix);
                // Fire a spark at the top of the bolt the moment the sheep
                // reaches it — main.js listens and triggers a small burst
                // via the CorralZapEffectPool. Idempotent guard so it
                // only fires once per ascending sheep.
                if (t >= 1 && !sheep.ascendSparked) {
                    sheep.ascendSparked = true;
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('corral-ascend-top', {
                            detail: { x: sx, y: baseY + ASCEND_HEIGHT, z: sz }
                        }));
                    }
                }
                continue;
            }

            // Update transform matrix using interpolated render position for smooth movement
            const sheepY = this._surfaceY(sheep.renderPosition.x, sheep.renderPosition.z);
            dummy.position.set(sheep.renderPosition.x, sheepY, sheep.renderPosition.z);
            const sheepYaw = -sheep.renderFacingDirection + Math.PI / 2;
            dummy.rotation.y = sheepYaw;
            this._applyTerrainTilt(dummy, sheep.renderPosition.x, sheep.renderPosition.z, sheepYaw);

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
            
            if (animationUpdateStride === 1 || ((i + animationFrame) % animationUpdateStride) === 0) {
                this.updateInstanceAttributes(i, sheep);
            }
        }
        this._animationUpdateFrame = (animationFrame + 1) % animationUpdateStride;
        
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
        dummy.rotation.order = 'YXZ';
        
        for (let i = 0; i < this.sheepCount; i++) {
            const sheep = this.sheep[i];
            
            // Force render position to match physics position immediately
            sheep.renderPosition.x = sheep.position.x;
            sheep.renderPosition.z = sheep.position.z;
            sheep.renderFacingDirection = sheep.facingDirection;
            
            // Update transform matrix
            const sheepY = this._surfaceY(sheep.renderPosition.x, sheep.renderPosition.z);
            dummy.position.set(sheep.renderPosition.x, sheepY, sheep.renderPosition.z);
            const sheepYaw = -sheep.renderFacingDirection + Math.PI / 2;
            dummy.rotation.y = sheepYaw;
            this._applyTerrainTilt(dummy, sheep.renderPosition.x, sheep.renderPosition.z, sheepYaw);
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            
            this.instancedMesh.setMatrixAt(i, dummy.matrix);
            
            // Update animation attributes
            this.updateInstanceAttributes(i, sheep);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    
    /**
     * Tilt the dummy's pitch (rotation.x) and roll (rotation.z) to follow the
     * terrain slope at (x, z), projected against the given yaw. Mutates the
     * dummy in place. Must be called AFTER `dummy.rotation.y` is set and
     * BEFORE `dummy.updateMatrix()`. No-op when heightfield is unset.
     *
     * Sheep don't smooth-lerp like the dog (each sheep is stateless across
     * frames in this loop) — the sample is fast enough that snapping straight
     * to the slope reads fine on a 4-leg animal at this size, and there's no
     * persistent rotation state per-sheep to interpolate from.
     *
     * @param {THREE.Object3D} dummy
     * @param {number} x
     * @param {number} z
     * @param {number} yaw
     */
    _applyTerrainTilt(dummy, x, z, yaw) {
        if (!this.heightfield) {
            dummy.rotation.x = 0;
            dummy.rotation.z = 0;
            return;
        }
        const n = this.heightfield.normal(x, z);
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        const rx = Math.cos(yaw);
        const rz = -Math.sin(yaw);
        const ny = Math.max(n.y, 0.001);
        const slopeForward = -(n.x * fx + n.z * fz) / ny;
        const slopeRight   = -(n.x * rx + n.z * rz) / ny;
        const maxTilt = 0.32; // ~18°, slightly tighter than the dog
        const pitch = Math.max(-maxTilt, Math.min(maxTilt, -Math.atan(slopeForward)));
        const roll  = Math.max(-maxTilt, Math.min(maxTilt,  Math.atan(slopeRight)));
        dummy.rotation.x = pitch;
        dummy.rotation.z = roll;
    }

    /**
     * Get all sheep instances
     */
    getSheep() {
        return this.sheep;
    }

    /**
     * Estimate total triangle count for the sheep instanced mesh:
     * triangles in the merged per-sheep geometry * instance count.
     * Called once post-init for the PERF overlay.
     * @returns {number}
     */
    getTotalTriangleEstimate() {
        return Math.round(geometryTriangleCount(this.mergedGeometry) * this.sheepCount);
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
        dummy.rotation.order = 'YXZ';
        const {
            centerX, centerZ, spreadRadius, borderPoints, clusterCenters, maxRadius,
            defaultCount
        } = this.spawnConfig;
        const edgeMargin = 5; // Minimum distance from fence edges

        // Cycle 8 Phase 2: same cluster + density logic as initializeSheepData.
        const sceneClusters = (clusterCenters && clusterCenters.length > 0)
            ? clusterCenters
            : [{ x: centerX, z: centerZ }];
        const baseCount = defaultCount && defaultCount > 0 ? defaultCount : 200;
        const perClusterDefault = baseCount / sceneClusters.length;
        const perClusterActual = this.sheepCount / sceneClusters.length;
        let effectiveRadius = spreadRadius;
        if (perClusterActual > perClusterDefault) {
            const scale = Math.sqrt(perClusterActual / perClusterDefault);
            effectiveRadius = spreadRadius * scale;
        }
        if (maxRadius && effectiveRadius > maxRadius) {
            effectiveRadius = maxRadius;
        }

        for (let i = 0; i < this.sheepCount; i++) {
            const sheep = this.sheep[i];
            const cluster = sceneClusters[i % sceneClusters.length];
            const clusterCx = cluster.x;
            const clusterCz = cluster.z;

            // Reset position to starting area - use polygon-aware spawning with edge margin
            let x, z;
            let attempts = 0;
            const maxAttempts = 100; // Increased attempts for safer spawning

            // Try to find a valid spawn position inside the polygon with margin from edges
            do {
                const angle = Math.random() * Math.PI * 2;
                const distance = Math.random() * effectiveRadius;
                x = clusterCx + Math.cos(angle) * distance;
                z = clusterCz + Math.sin(angle) * distance;
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
            const respawnY = this._surfaceY(x, z);
            dummy.position.set(x, respawnY, z);
            dummy.rotation.y = sheep.facingDirection;
            dummy.scale.set(1, 1, 1);
            dummy.updateMatrix();
            this.instancedMesh.setMatrixAt(i, dummy.matrix);
            
            // Update animation attributes
            this.updateInstanceAttributes(i, sheep);
        }
        
        this.instancedMesh.instanceMatrix.needsUpdate = true;
    }

    _surfaceY(x, z) {
        if (!this.heightfield) return 0;
        if (typeof this.heightfield.surfaceY === 'function') {
            return this.heightfield.surfaceY(x, z);
        }
        if (typeof this.heightfield.sample === 'function') {
            return this.heightfield.sample(x, z);
        }
        return 0;
    }

    /**
     * Tear down GPU resources and release scene refs. Used by Cycle 11
     * Phase 1 in-process scene swap. Idempotent. Mirrors the removal half
     * of GameState.recreateSheepFlock() but adds geometry + material disposal
     * the recreate path skipped (because the page reloaded right after).
     *
     * Owned-and-disposed: instancedMesh + mergedGeometry + material.
     * Borrowed-but-released: audioManager, heightfield (owned by GameState).
     * Untouched: extreme-boid module singleton (GameState.reset() resets it
     * via resetExtremeBoidSystem(); double-resetting from here would race).
     */
    dispose() {
        if (this._disposed) return;
        this._disposed = true;

        if (this.instancedMesh) {
            if (this.instancedMesh.parent) this.instancedMesh.parent.remove(this.instancedMesh);
            this.instancedMesh = null;
        }
        if (this.mergedGeometry) {
            this.mergedGeometry.dispose();
            this.mergedGeometry = null;
        }
        if (this.material) {
            this.konveyorSheepMaterialControls?.dispose?.();
            if (Array.isArray(this.material)) {
                this.material.forEach(m => m?.dispose?.());
            } else {
                this.material.dispose();
            }
            this.material = null;
        }

        this.sheep = [];
        this.audioManager = null;
        this.heightfield = null;
        this.scene = null;

        this.extremeBoidSystemInitialized = false;
    }

    /**
     * Inline vertex shader fallback (used if external shader fails to load)
     * Premium Wool Edition with displacement
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
            varying vec3 vWorldPosition;
            varying float vDisplacement;
            varying float vIsBody;
            varying float vVertexId;

            float hash(vec3 p) {
                p = fract(p * 0.3183099 + 0.1);
                p *= 17.0;
                return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            float noise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
            }

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
                vVertexId = vertexId;
                vIsBody = vertexId < 50.0 ? 1.0 : 0.0;
                vNormal = normalMatrix * normal;
                vec3 animatedPosition = animateVertex(position, vertexId);

                vDisplacement = 0.0;
                if (vIsBody > 0.5) {
                    float uniqueId = instanceData.w;
                    vec3 noisePos1 = position * 5.0 + vec3(time * 0.2) + vec3(uniqueId * 0.1);
                    vec3 noisePos2 = position * 12.0 + vec3(time * 0.4) + vec3(uniqueId * 0.2);
                    float displacement = noise(noisePos1) * 0.08 + noise(noisePos2) * 0.03;
                    animatedPosition += normal * displacement;
                    vDisplacement = displacement;
                    float breathe = sin(time * 1.8 + instanceData.x) * 0.012;
                    animatedPosition.y += breathe;
                    animatedPosition.x += sin(time * 1.2 + instanceData.x) * 0.004;
                }

                vec4 instancePosition = instanceMatrix * vec4(animatedPosition, 1.0);
                vWorldPosition = instancePosition.xyz;
                vec4 mvPosition = modelViewMatrix * instancePosition;
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;
    }

    /**
     * Inline fragment shader fallback (used if external shader fails to load)
     * Premium Wool Edition with enhanced shading
     */
    getInlineFragmentShader() {
        return `
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec3 vViewPosition;
            varying vec3 vWorldPosition;
            varying float vDisplacement;
            varying float vIsBody;
            varying float vVertexId;

            uniform float time;
            uniform vec3 fogColor;
            uniform float fogDensity;

            float hash(vec3 p) {
                p = fract(p * 0.3183099 + 0.1);
                p *= 17.0;
                return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            float noise(vec3 p) {
                vec3 i = floor(p);
                vec3 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                return mix(
                    mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                        mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                    mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                        mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
            }

            float fbm(vec3 p) {
                float value = 0.0;
                float amplitude = 0.5;
                for (int i = 0; i < 3; i++) {
                    value += amplitude * noise(p);
                    p *= 2.2;
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(vViewPosition);
                vec3 lightDir = normalize(vec3(0.3, 1.0, 0.5));

                vec3 perturbedNormal = normal;
                if (vIsBody > 0.5) {
                    vec3 noisePos = vWorldPosition * 10.0;
                    float n = fbm(noisePos);
                    perturbedNormal = normalize(normal + vec3(n - 0.5) * 0.3);
                }

                float NdotL = dot(perturbedNormal, lightDir);
                float toon = smoothstep(-0.15, 0.15, NdotL) * 0.55 + 0.45;
                toon = floor(toon * 5.0) / 5.0;

                vec3 warmShift = vec3(1.02, 1.02, 1.0);
                vec3 coolShift = vec3(0.96, 0.97, 1.0);
                vec3 colorShift = mix(coolShift, warmShift, toon);

                vec3 woolColor = vColor;
                if (vIsBody > 0.5) {
                    float woolNoise = fbm(vWorldPosition * 6.0);
                    woolColor -= vec3(0.03) * (1.0 - woolNoise);
                    woolColor += vec3(0.02) * woolNoise;
                }

                vec3 finalColor = woolColor * toon * colorShift;

                float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 2.8);
                vec3 rimColor = vec3(1.0, 1.0, 1.0);
                finalColor += rimColor * fresnel * 0.35 * vIsBody;

                float sss = max(0.0, dot(-lightDir, viewDir));
                sss = pow(sss, 3.0) * 0.12;
                finalColor += vec3(1.0, 1.0, 0.98) * sss * vIsBody;

                float edge = 1.0 - pow(abs(dot(viewDir, normal)), 0.7);
                finalColor *= 1.0 - edge * 0.2 * vIsBody;

                finalColor -= vec3(0.03) * vDisplacement * 1.5;

                // FogExp2 — matches scene.fog, kept in sync via update().
                float depth = length(vViewPosition);
                float fogFactor = 1.0 - exp(-fogDensity * fogDensity * depth * depth);
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
    
    updateBehavior(allSheep, sheepdog, gate, pasture, bounds, params, enableIndividualBleating = true, isMultiplayer = false, sheepdog2 = null, skipFlocking = false, isHighDifficultyMode = false) {
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
        
        // Optional parameter overrides (primarily used for extreme/insane tuning UI)
        if (params) {
            if (params.perception !== undefined) this.perceptionRadius = params.perception;
            if (params.separationWeight !== undefined) this.separationWeight = params.separationWeight;
            if (params.alignmentWeight !== undefined) this.alignmentWeight = params.alignmentWeight;
            if (params.maxForce !== undefined) this.maxForce = params.maxForce;
            if (params.fleeRadius !== undefined) this.fleeRadius = params.fleeRadius;
            if (params.gateAttraction !== undefined) this.gateAttraction = params.gateAttraction;
        }

        // Normal flocking behavior - only consider active sheep (state 0)
        // Skip if ExtremeBoidSystem is handling flocking (for performance)
        if (!skipFlocking) {
            const activeSheep = allSheep.filter(sheep => sheep.state === 0);
            this.flock(activeSheep, params.separationDistance);
        }

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
                    // Stronger flee force only for high-difficulty solo modes (extreme/insane).
                    // Sandbox may use extreme boids for performance, but should keep normal flee behavior.
                    const extremeFleeMultiplier = params?.fleeMultiplier !== undefined ? params.fleeMultiplier : 4.0;
                    const fleeMultiplier = isHighDifficultyMode ? extremeFleeMultiplier : 1.2;
                    fleeForce.multiply(fleeMultiplier);
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

        // Cycle 6 Phase 2: route around tree trunks + large rocks. The
        // length-guard preserves Field's sim-baseline byte-identical path
        // (Field has zero obstacles).
        const obstacles = getGameState()?.obstacles;
        if (obstacles && (obstacles.trees.length > 0 || obstacles.rocks.length > 0)) {
            if (obstacles.trees.length > 0) {
                const nearbyTrees = obstacles.queryTrees(this.position, SHEEP_OBSTACLE_QUERY_RADIUS);
                if (nearbyTrees.length > 0) {
                    const f = obstacleAvoidance(this.position, SHEEP_RADIUS, nearbyTrees, { strength: SHEEP_OBSTACLE_STRENGTH });
                    if (f.x !== 0 || f.z !== 0) this.applyForce(new Vector2D(f.x, f.z));
                }
            }
            if (obstacles.rocks.length > 0) {
                const nearbyRocks = obstacles.queryRocks(this.position, SHEEP_OBSTACLE_QUERY_RADIUS);
                if (nearbyRocks.length > 0) {
                    const f = obstacleAvoidance(this.position, SHEEP_RADIUS, nearbyRocks, { strength: SHEEP_OBSTACLE_STRENGTH });
                    if (f.x !== 0 || f.z !== 0) this.applyForce(new Vector2D(f.x, f.z));
                }
            }
        }

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
                    if (this.boundary && this.boundary.kind === 'island') {
                        // Radial clamp at island radius (with margin)
                        const cx = this.boundary.center.x;
                        const cz = this.boundary.center.z;
                        const dx = this.position.x - cx;
                        const dz = this.position.z - cz;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        const maxR = this.boundary.radius - margin;
                        if (dist > maxR && dist > 1e-6) {
                            const scale = maxR / dist;
                            this.position.x = cx + dx * scale;
                            this.position.z = cz + dz * scale;
                        }
                    } else {
                        this.position.x = Math.max(this.bounds.minX + margin, Math.min(this.bounds.maxX - margin, this.position.x));
                        this.position.z = Math.max(this.bounds.minZ + margin, Math.min(this.bounds.maxZ - margin, this.position.z));
                    }
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
    // Accepts either legacy `bounds` rect or new discriminated `Boundary`.
    avoidBoundariesWithGate(boundsOrBoundary, gate) {
        const margin = 3;
        const steer = new Vector2D(0, 0);
        const position = this.position;

        // Island branch — radial smoothstep inward force; gates aren't carved (islands have no perimeter gates)
        if (boundsOrBoundary && boundsOrBoundary.kind === 'island') {
            const center = boundsOrBoundary.center;
            const radius = boundsOrBoundary.radius;
            const falloff = boundsOrBoundary.falloff;
            const dx = position.x - center.x;
            const dz = position.z - center.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const safeRadius = radius - falloff;
            if (dist > safeRadius && dist > 1e-6) {
                const tRaw = (dist - safeRadius) / falloff;
                const t = Math.min(1, Math.max(0, tRaw));
                const force = t * t * (3 - 2 * t);
                const inv = 1 / dist;
                steer.x = -dx * inv * this.maxSpeed * force * 1.2;
                steer.z = -dz * inv * this.maxSpeed * force * 1.2;
            }
            return steer;
        }

        // Rect path — preserved
        const bounds = boundsOrBoundary;
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

    /**
     * Cycle 5+ corral entry check (Rolling Hills). Sheep retires when it
     * enters the circular corral zone. Returns true the first frame
     * retirement triggers.
     *
     * Sets hasPassedGate (reusing the flag so existing counters work) and
     * triggers the ascend-into-sky animation. The sheep stops horizontal
     * movement, rises upward, and fades out — the lightning-zap effect
     * fires at the sheep's position via a global event.
     * @param {{center: {x: number, z: number}, radius: number}} corral
     * @returns {boolean}
     */
    checkCorralAndRetire(corral) {
        if (this.hasPassedGate) return false;
        if (!corral || !corral.center) return false;

        const dx = this.position.x - corral.center.x;
        const dz = this.position.z - corral.center.z;
        const distSq = dx * dx + dz * dz;
        const r = corral.radius;

        if (distSq <= r * r) {
            this.hasPassedGate = true;
            this.isRetiring = true;
            this.isAscending = true;
            this.ascendT = 0;
            // Cycle 7: cache the position at the moment of zap so the
            // ascend renders straight up the lightning bolt, not drifting
            // with any residual physics. Without these, post-zap render
            // can read sheep.position from a frame where some other system
            // nudged it (boundary, terrain) and the visual drifts off.
            this.ascendStartX = this.position.x;
            this.ascendStartZ = this.position.z;
            this.ascendSparked = false;
            this.retirementTarget = null;  // no horizontal target — going straight up
            this.velocity.set(0, 0);
            this.acceleration.set(0, 0);
            this.state = 2;  // grazing-equivalent — boundary force won't apply
            return true;
        }
        return false;
    }

    setBounds(bounds) {
        this.bounds = bounds;
    }

    /**
     * Set the discriminated Boundary for this sheep. When set with kind 'island',
     * boundary force + hard clamp use radial math instead of rect.
     * Cycle 5+. `setBounds` continues to set the legacy rect bbox; the two
     * coexist (renderer code may still read this.bounds).
     * @param {import('../shared/scenes/types.js').Boundary} boundary
     */
    setBoundary(boundary) {
        this.boundary = boundary;
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
