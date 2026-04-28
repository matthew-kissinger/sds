import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GrassSystem } from './GrassSystem.js';
import { log as probeLog } from './diagnostics/glProbe.js';
import { ProceduralMountains } from './ProceduralMountains.js';
import { getSceneManager } from './GameBridge.js';

// Phase A Unit B compressed all GLBs with Draco + Meshopt. Every GLTFLoader
// in the codebase needs both decoders attached or those GLBs fail to parse
// with "No DRACOLoader instance provided". Draco decoder is hosted by Google;
// Meshopt decoder ships as a JS module with three. Construct once, reuse.
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/v1/decoders/';
let _sharedDracoLoader = null;
export function getSharedDracoLoader() {
    if (!_sharedDracoLoader) {
        _sharedDracoLoader = new DRACOLoader();
        _sharedDracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    }
    return _sharedDracoLoader;
}
export function configureGLTFLoader(loader) {
    loader.setDRACOLoader(getSharedDracoLoader());
    loader.setMeshoptDecoder(MeshoptDecoder);
    return loader;
}
import {
    countMeshTriangles,
    sumInstancedMeshTriangles,
    sumObjectTreeTriangles
} from './utils/TriangleCount.js';
import { generateTrees } from '../shared/TreePlacement.js';
import { mulberry32 } from '../shared/Random.js';

/**
 * TerrainBuilder - Handles terrain, grass, mountains, and environmental elements.
 * Scene-aware: when a SceneDef is passed, zones / farm house / grass density come
 * from it. Without one, falls back to Home Field defaults (byte-identical to the
 * pre-refactor hardcodes).
 */
export class TerrainBuilder {
    /**
     * @param {THREE.Scene} scene
     * @param {boolean} [isMobile=false]
     * @param {import('../shared/scenes/types.js').SceneDef} [sceneDef]
     */
    constructor(scene, isMobile = false, sceneDef = null) {
        this.scene = scene;
        this.isMobile = isMobile;
        this.sceneDef = sceneDef;
        this.grassMaterial = null;
        this.grassInstanceCount = 0;
        this.grassInstancedMesh = null;

        // New advanced grass system
        this.grassSystem = null;
        this.terrainMesh = null;
        this.environmentDetails = [];
        this.trees = []; // Track trees for removal
        this.rocks = []; // Track rocks for removal
        // Per-rock world-space footprint (populated by addEnvironmentDetails).
        // createTrees reads this to skip tree candidates that would spawn
        // inside a big rock formation. Initialised here so call-order
        // ordering (rocks-before-trees) doesn't crash if `createTrees` ever
        // runs before `addEnvironmentDetails`.
        this.rockPositions = [];
        this.mountains = []; // Track mountains
        this.buildings = []; // Track buildings

        // Model loading - GLTFLoader with Draco + Meshopt decoders for compressed GLBs.
        this.loader = configureGLTFLoader(new GLTFLoader());
        this.models = {
            trees: {},
            rocks: {},
            mountains: {},
            buildings: {},
            animals: {}
        };
        this.modelsLoaded = false;

        // Terrain zones — from scene if provided, otherwise Home Field defaults.
        this.zones = sceneDef?.terrain?.zones ?? {
            playArea: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
            nearField: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 },
            midField: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 },
            farField: { minX: -600, maxX: 600, minZ: -600, maxZ: 600 },
            horizon: { minX: -800, maxX: 800, minZ: -800, maxZ: 800 }
        };

        // Farm house position and exclusion area — from scene if provided.
        this.farmHousePosition = sceneDef?.farmHouse?.position ?? { x: 180, z: 160 };
        this.farmHouseExclusionArea = sceneDef?.farmHouse?.exclusionArea ?? {
            minX: 140,
            maxX: 220,
            minZ: 120,
            maxZ: 200
        };
        
        // LOD settings
        this.lodDistances = {
            near: 50,
            mid: 150,
            far: 300,
            horizon: 500
        };
        
        // Frustum culling helper
        this.frustum = new THREE.Frustum();
        this.frustumMatrix = new THREE.Matrix4();
        
        // Performance tracking for mobile
        this.cullingStats = {
            grassVisible: 0,
            treesVisible: 0,
            rocksVisible: 0,
            mountainsVisible: 0,
            lastUpdate: 0
        };
        
        // Reference to performance monitor for stats reporting
        this.performanceMonitor = null;
        
        // Mobile-optimized materials cache
        this.mobileMaterials = null;
        this.desktopMaterials = null;

        // Optional heightfield for terrain displacement + prop placement.
        // Threaded in by main.js after async load; null when scene has no
        // heightmapUrl or load failed (flat-plane fallback).
        /** @type {import('../shared/terrain/Heightfield.js').Heightfield | null} */
        this.heightfield = null;
    }

    /**
     * Set the heightfield used for terrain displacement and prop y-placement.
     * Must be called BEFORE createTerrain() / createTrees() / addMountains() /
     * addFarmHouse() to take effect.
     *
     * @param {import('../shared/terrain/Heightfield.js').Heightfield | null} heightfield
     */
    setHeightfield(heightfield) {
        this.heightfield = heightfield ?? null;
    }
    
    /**
     * Create mobile-optimized materials for better performance
     */
    createMobileMaterials() {
        this.mobileMaterials = {
            grass: this.grassMaterial, // Already optimized with static shader
            tree: new THREE.MeshLambertMaterial({
                color: 0x2d4a2b,
                emissive: 0x1a2a1a,
                emissiveIntensity: 0.05
            }),
            rock: new THREE.MeshLambertMaterial({
                color: 0x666666,
                emissive: 0x333333,
                emissiveIntensity: 0.05
            }),
            terrain: new THREE.MeshLambertMaterial({
                color: 0x4a7c4a,
                emissive: 0x1a3a1a,
                emissiveIntensity: 0.1
            })
        };
        
        // Store original desktop materials for comparison
        this.desktopMaterials = {
            tree: new THREE.MeshStandardMaterial({
                color: 0x2d4a2b,
                roughness: 0.8,
                metalness: 0.2
            }),
            rock: new THREE.MeshStandardMaterial({
                color: 0x666666,
                roughness: 0.9,
                metalness: 0.1
            })
        };
    }
    
    async loadModels() {
        // Idempotent — Cycle 11 Phase 1 in-process scene swap reuses the same
        // TerrainBuilder instance across scenes, and re-fetching the GLB cache
        // every swap blows the warm-swap perf budget (target ≤600ms desktop).
        if (this.modelsLoaded) {
            return;
        }

        // Create mobile materials if needed
        if (this.isMobile) {
            this.createMobileMaterials();
        }

        console.log(`[ASSET] Loading models (mobile=${this.isMobile})`);

        // Track loading errors
        const loadErrors = [];
        const criticalErrors = [];

        const modelPaths = {
            trees: [
                { name: 'tree1', path: 'assets/models/Resource_Tree1.glb' },
                { name: 'tree2', path: 'assets/models/Resource_Tree2.glb' },
                { name: 'pine', path: 'assets/models/Resource_PineTree.glb' }
            ],
            rocks: [
                { name: 'rock1', path: 'assets/models/Resource_Rock_1.glb' },
                { name: 'rock2', path: 'assets/models/Resource_Rock_2.glb' },
                { name: 'rock3', path: 'assets/models/Resource_Rock_3.glb' }
            ],
            mountains: [
                { name: 'mountain1', path: 'assets/models/Mountain_Group_1.glb' },
                { name: 'mountain2', path: 'assets/models/Mountain_Group_2.glb' }
            ],
            buildings: [
                { name: 'farmhouse', path: 'assets/models/Farm house.glb' }
            ],
            // Optimized dog models (19 animations, fast load)
            animals: [
                { name: 'jep', path: 'assets/models/Jep.glb', critical: true },
                { name: 'pip', path: 'assets/models/Pip.glb', critical: true },
                { name: 'sally', path: 'assets/models/Sally.glb', critical: true },
                { name: 'shiloh', path: 'assets/models/Shiloh.glb', critical: true },
                { name: 'george_washington', path: 'assets/models/George_Washington.glb', critical: true }
            ]
        };

        const loadPromises = [];

        // Load tree models (non-critical). Bake child mesh transforms into
        // their geometries so that the InstancedMesh-per-child path in
        // createTrees correctly represents the tree's spatial layout (some
        // GLBs nest trunk + foliage as separate child meshes with their own
        // local offsets — without baking, those offsets are dropped). Then
        // measure each child geometry's min.y so we can lift the visible
        // bottom of the tree to terrain regardless of GLB origin convention.
        for (const model of modelPaths.trees) {
            loadPromises.push(
                this.loader.loadAsync(model.path).then(gltf => {
                    const root = gltf.scene;
                    root.updateMatrixWorld(true);
                    let minY = Infinity;
                    let maxY = -Infinity;
                    root.traverse(child => {
                        if (!child.isMesh || !child.geometry) return;
                        // Clone before mutating so any other consumer of this
                        // GLB sees the original geometry.
                        child.geometry = child.geometry.clone();
                        // Bake the world transform of this child (relative to
                        // the gltf scene root) into its geometry. After this,
                        // the child's own transform can be reset to identity
                        // and the geometry alone represents the child's
                        // contribution at the right position.
                        child.geometry.applyMatrix4(child.matrixWorld);
                        child.position.set(0, 0, 0);
                        child.quaternion.identity();
                        child.scale.set(1, 1, 1);
                        child.updateMatrixWorld(true);
                        child.geometry.computeBoundingBox();
                        const bb = child.geometry.boundingBox;
                        if (bb && isFinite(bb.min.y)) {
                            if (bb.min.y < minY) minY = bb.min.y;
                            if (bb.max.y > maxY) maxY = bb.max.y;
                        }
                    });
                    if (!isFinite(minY)) { minY = 0; maxY = 1; }
                    root.userData.modelBaseYOffset = -minY;
                    root.userData.modelBboxMinY = minY;
                    root.userData.modelBboxMaxY = maxY;
                    this.models.trees[model.name] = root;
                    console.log(`[OK] Loaded tree model: ${model.name} (bbox y=[${minY.toFixed(2)}, ${maxY.toFixed(2)}])`);
                }).catch(err => {
                    const errMsg = `tree/${model.name}: ${err.message || err}`;
                    console.error(`[ERROR] Failed to load ${errMsg}`);
                    loadErrors.push(errMsg);
                })
            );
        }

        // Load rock models (non-critical)
        for (const model of modelPaths.rocks) {
            loadPromises.push(
                this.loader.loadAsync(model.path).then(gltf => {
                    this.models.rocks[model.name] = gltf.scene;
                    console.log(`[OK] Loaded rock model: ${model.name}`);
                }).catch(err => {
                    const errMsg = `rock/${model.name}: ${err.message || err}`;
                    console.error(`[ERROR] Failed to load ${errMsg}`);
                    loadErrors.push(errMsg);
                })
            );
        }

        // Load mountain models (non-critical)
        for (const model of modelPaths.mountains) {
            loadPromises.push(
                this.loader.loadAsync(model.path).then(gltf => {
                    this.models.mountains[model.name] = gltf.scene;
                    console.log(`[OK] Loaded mountain model: ${model.name}`);
                }).catch(err => {
                    const errMsg = `mountain/${model.name}: ${err.message || err}`;
                    console.error(`[ERROR] Failed to load ${errMsg}`);
                    loadErrors.push(errMsg);
                })
            );
        }

        // Load building models (non-critical). Same bbox.min.y measurement
        // as trees so we can lift each building's visible base to terrain
        // height regardless of GLB origin convention. (Without this, the
        // farmhouse sinks because its origin is at the centroid, not the
        // foundation.)
        for (const model of modelPaths.buildings) {
            loadPromises.push(
                this.loader.loadAsync(model.path).then(gltf => {
                    const root = gltf.scene;
                    root.updateMatrixWorld(true);
                    const bbox = new THREE.Box3().setFromObject(root);
                    root.userData.modelBaseYOffset = isFinite(bbox.min.y) ? -bbox.min.y : 0;
                    this.models.buildings[model.name] = root;
                    console.log(`[OK] Loaded building model: ${model.name} (baseYOffset=${root.userData.modelBaseYOffset.toFixed(3)})`);
                }).catch(err => {
                    const errMsg = `building/${model.name}: ${err.message || err}`;
                    console.error(`[ERROR] Failed to load ${errMsg}`);
                    loadErrors.push(errMsg);
                })
            );
        }

        // Load animal models - CRITICAL for gameplay
        for (const model of modelPaths.animals) {
            loadPromises.push(
                this.loader.loadAsync(model.path)
                    .then(gltf => {
                        this.models.animals[model.name] = gltf.scene;
                        this.models.animals[model.name + '_animations'] = gltf.animations;
                        console.log(`[OK] Loaded ${model.name} with ${gltf.animations.length} animations from ${model.path}`);
                    })
                    .catch(err => {
                        const errMsg = `animal/${model.name} (${model.path}): ${err.message || err}`;
                        console.error(`[CRITICAL ERROR] Failed to load ${errMsg}`);
                        loadErrors.push(errMsg);
                        if (model.critical) {
                            criticalErrors.push(errMsg);
                        }
                    })
            );
        }

        await Promise.all(loadPromises);
        this.modelsLoaded = true;

        // Report loading results
        const loadedAnimals = Object.keys(this.models.animals).filter(k => !k.endsWith('_animations'));
        console.log(`[ASSET] Loaded ${loadedAnimals.length}/5 animal models:`, loadedAnimals);

        if (loadErrors.length > 0) {
            console.error(`[ASSET] ${loadErrors.length} models failed to load:`, loadErrors);
        }

        // Throw error if critical models failed (like jep dog)
        if (criticalErrors.length > 0) {
            const errorMsg = `Critical models failed to load: ${criticalErrors.join(', ')}`;
            console.error(`[ASSET] ${errorMsg}`);
            throw new Error(errorMsg);
        }

        console.log('[ASSET] All critical models loaded successfully!');
    }
    
    isInZone(x, z, zone) {
        return x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ;
    }
    
    getZoneForPosition(x, z) {
        const dist = Math.sqrt(x * x + z * z);
        if (dist < 100) return 'playArea';
        if (dist < 200) return 'nearField';
        if (dist < 400) return 'midField';
        if (dist < 600) return 'farField';
        return 'horizon';
    }

    /**
     * Terrain-mesh-accurate ground height for entity placement.
     *
     * `heightfield.sample()` clamps to edge values when (x,z) falls outside the
     * heightfield's worldSize, but the terrain mesh applies a smoothstep
     * falloff to 0 over the last 20m of that worldSize (so the visible ground
     * past ~±200m is dead-flat at y=0). Trees and rocks placed in the outer
     * zones (midField/farField/horizon, up to ±800m) would sample the clamped
     * edge height and sit floating above a flat skirt — visible immediately
     * in third-person. This helper mirrors the terrain's falloff so placement
     * always tracks what's actually drawn.
     */
    _groundY(x, z) {
        if (!this.heightfield) return 0;
        const h = this.heightfield.sample(x, z);
        const hfHalf = this.heightfield.worldSize * 0.5;
        const fadeStart = hfHalf - 20;
        const fadeEnd = hfHalf;
        const radial = Math.max(Math.abs(x), Math.abs(z));
        if (radial <= fadeStart) return h;
        const t = Math.min(1, (radial - fadeStart) / (fadeEnd - fadeStart));
        const falloff = 1 - t * t * (3 - 2 * t);
        return h * falloff;
    }


    
    createTerrain() {
        // Create base terrain mesh; heightfield displacement applied below.
        // Plane is sized so its edge falls deep into atmospheric fog before the
        // camera can see it at max zoom-out. Heightfield content is confined to
        // the inner ~±200m (worldSize/2); everything past that is a dead-flat
        // skirt at y=0, so coarser quads in the outer zone cost nothing visually.
        // The earlier 2400m/1600m sizes left the perpendicular edge only ~40%
        // fogged at FogExp2 density 0.0006 — a faint but visible cutoff line.
        //   Desktop: 4000m / 384 = 10.4m/quad — edge at 2000m is ~76% fogged.
        //   Mobile:  3200m / 256 = 12.5m/quad — edge at 1600m is ~69% fogged.
        // Segment count was bumped on mobile (192 → 256) so the inner heightfield
        // sampling stays usable; desktop's 384 was already plenty for the larger plane.
        const terrainSize = this.isMobile ? 3200 : 4000;
        const terrainSegments = this.isMobile ? 256 : 384;
        const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);

        // Apply heightfield displacement before the mesh is rotated to lie flat.
        // Geometry is built in the XY plane; after the mesh is rotated -PI/2
        // around X, local (a, b, c) maps to world (a, c, -b). So local Z
        // displacement becomes world Y, and world (X, Z) maps to local (a, -b).
        if (this.heightfield) {
            // Smooth radial falloff: heightfield content fades to 0 over the
            // last few metres of its worldSize so the plane outside the
            // heightfield extends as a flat skirt to the horizon (instead of
            // an abrupt plateau at the edge texel value).
            const hfHalf = this.heightfield.worldSize * 0.5;
            const fadeStart = hfHalf - 20;
            const fadeEnd = hfHalf;
            const positions = terrainGeometry.attributes.position;
            for (let i = 0; i < positions.count; i++) {
                const a = positions.getX(i);
                const b = positions.getY(i);
                const worldX = a;
                const worldZ = -b;
                const h = this.heightfield.sample(worldX, worldZ);
                const radial = Math.max(Math.abs(worldX), Math.abs(worldZ));
                let falloff = 1;
                if (radial > fadeStart) {
                    const t = Math.min(1, (radial - fadeStart) / (fadeEnd - fadeStart));
                    falloff = 1 - t * t * (3 - 2 * t); // smoothstep, inverted
                }
                positions.setZ(i, h * falloff);
            }
            positions.needsUpdate = true;
            terrainGeometry.computeVertexNormals();
            console.log(`[TERRAIN] Heightfield-displaced terrain (${positions.count} verts, plane=${terrainSize}m)`);
        }

        // Custom shader material for varied ground. Uses Three.js's standard
        // fog chunks (fog_pars_*, fog_*) instead of a hand-rolled fog so
        // `scene.fog`, which Atmosphere drives to match the sky's horizon
        // color per-frame, is the single source of truth for terrain fade.
        // Without this, terrain faded to a fixed warm-grey-green while the
        // skybox showed sky color — a visible cutoff line where the two met.
        const terrainMaterial = new THREE.ShaderMaterial({
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib.fog,
                {
                    baseColor1: { value: new THREE.Color(0x3d5c2e) },  // Dark earthy green
                    baseColor2: { value: new THREE.Color(0x5a7a42) },  // Medium green
                    baseColor3: { value: new THREE.Color(0x4a6838) },  // Olive green
                    dirtColor:  { value: new THREE.Color(0x6b5d4a) }   // Brown dirt patches
                }
            ]),
            fog: true,
            vertexShader: `
                #include <common>
                #include <fog_pars_vertex>

                varying vec2 vUv;
                varying vec3 vWorldPos;

                void main() {
                    vUv = uv;
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPos = worldPos.xyz;
                    vec4 mvPosition = viewMatrix * worldPos;
                    #include <fog_vertex>
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;

                #include <common>
                #include <fog_pars_fragment>

                uniform vec3 baseColor1;
                uniform vec3 baseColor2;
                uniform vec3 baseColor3;
                uniform vec3 dirtColor;

                varying vec2 vUv;
                varying vec3 vWorldPos;

                // Simple noise function
                float hash(vec2 p) {
                    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
                }

                float noise(vec2 p) {
                    vec2 i = floor(p);
                    vec2 f = fract(p);
                    f = f * f * (3.0 - 2.0 * f);

                    float a = hash(i);
                    float b = hash(i + vec2(1.0, 0.0));
                    float c = hash(i + vec2(0.0, 1.0));
                    float d = hash(i + vec2(1.0, 1.0));

                    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
                }

                float fbm(vec2 p) {
                    float value = 0.0;
                    float amplitude = 0.5;
                    for (int i = 0; i < 4; i++) {
                        value += amplitude * noise(p);
                        p *= 2.0;
                        amplitude *= 0.5;
                    }
                    return value;
                }

                void main() {
                    // Multi-scale noise for natural variation
                    float n1 = fbm(vWorldPos.xz * 0.02);
                    float n2 = fbm(vWorldPos.xz * 0.05 + 100.0);
                    float n3 = noise(vWorldPos.xz * 0.1);

                    // Blend between green tones
                    vec3 color = mix(baseColor1, baseColor2, n1);
                    color = mix(color, baseColor3, n2 * 0.5);

                    // Add subtle dirt patches
                    float dirtMask = smoothstep(0.55, 0.7, n1 * n2);
                    color = mix(color, dirtColor, dirtMask * 0.4);

                    // Add fine detail variation
                    color *= 0.9 + n3 * 0.2;

                    // Subtle darkening in "low" areas (faux AO)
                    float ao = 0.85 + 0.15 * n1;
                    color *= ao;

                    gl_FragColor = vec4(color, 1.0);

                    // Three.js-managed fog (scene.fog driven by Atmosphere
                    // per-frame to match the sky's horizon color). Single
                    // chunk handles both linear THREE.Fog and FogExp2.
                    #include <fog_fragment>
                }
            `,
            side: THREE.FrontSide,
            // Cycle 5+: pull terrain depth slightly back so the AnimeWater
            // plane at y = -0.05 doesn't z-fight at the shoreline where
            // terrain falls off through sea level. No-op for scenes without
            // a water plane (Field).
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1
        });

        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0;
        terrain.receiveShadow = true;
        this.scene.add(terrain);

        this.terrainMesh = terrain;

        // Cycle 9 Phase 4: log terrain shader creation so the diag stream
        // shows the order of operations relative to atmosphere/water init.
        // If the shader fails to compile on Safari/Metal it usually shows
        // up as a console error, but the order itself is what we want.
        probeLog('terrain.created', {
            sceneFog: !!this.scene.fog,
            sceneFogType: this.scene.fog?.constructor?.name || null,
            verts: terrainGeometry.attributes.position.count,
            heightfield: !!this.heightfield,
        });

        return terrain;
    }
    
    async createGrass() {
        // Use new advanced grass system
        this.grassSystem = new GrassSystem(this.scene, this.isMobile, this.sceneDef?.grass, this.heightfield, this.sceneDef?.boundary ?? null);

        // Add exclusion zone for farm house — only if the scene actually
        // has one (Field has farmHouse; RH/OC don't).
        if (this.sceneDef?.farmHouse) {
            this.grassSystem.addExclusionZone(
                this.farmHouseExclusionArea.minX,
                this.farmHouseExclusionArea.maxX,
                this.farmHouseExclusionArea.minZ,
                this.farmHouseExclusionArea.maxZ
            );
        }

        // Cycle 7 fix: legacy pasture exclusion at z=98-138 was hardcoded
        // for Field's pen, but applied to every scene — leaving a bare
        // 70×40m patch on RH and on OC's spawn→portal corridor. Only
        // apply when the scene has a pasture.
        if (this.sceneDef?.pasture) {
            this.grassSystem.addExclusionZone(-35, 35, 98, 138);
        }

        // Initialize the grass system
        await this.grassSystem.init();

        // Store reference for compatibility
        const stats = this.grassSystem.getStats();
        this.grassInstanceCount = stats.totalClumps * (this.isMobile ? 3 : 5); // Effective blade count
        this.grassMaterial = this.grassSystem.grassMaterial;

        console.log(`[GRASS] Advanced grass system created: ${stats.totalClumps} clumps (~${this.grassInstanceCount} effective blades)`);

        return this.grassSystem;
    }

    async createTrees(competitivePastures = null) {
        if (!this.modelsLoaded) {
            console.warn('Models not loaded yet. Loading models...');
            await this.loadModels();
        }

        // Cycle 6 Phase 1: placement now lives in shared/TreePlacement.js
        // so client + Worker compute identical positions from the same seed.
        // The placement function returns flat (x, z, type, scale, rotationY)
        // — Y math (_groundY + per-model base offset) stays here on the
        // client because it's a renderer concern.
        const seed = this.sceneDef?.terrain?.seed ?? 0;
        const flatTrees = generateTrees(this.sceneDef, mulberry32(seed), {
            competitivePastures,
            rockPositions: this.rockPositions,
        });

        // Cache placement (Cycle 6 Phase 2 — main.js builds the obstacle
        // bundle from this list).
        this.treeInstances = flatTrees;

        const treeInstances = {
            tree1: [],
            tree2: [],
            pine: [],
        };
        for (const t of flatTrees) {
            // Use _groundY (mirrors terrain falloff) instead of raw heightfield
            // sample — trees in outer zones (midField/farField/horizon) extend
            // past the heightfield's worldSize and would otherwise float above
            // the flat skirt at the heightfield's clamped edge value.
            const treeY = this._groundY(t.x, t.z);
            // Compensate for the GLB's origin offset — different tree models
            // place their pivot at trunk-base vs. centroid, which sinks half
            // the trunk on hilly scenes if you just place at terrain Y.
            const baseOffset = this.models.trees[t.type]?.userData?.modelBaseYOffset ?? 0;
            const placementY = treeY + baseOffset * t.scale;
            treeInstances[t.type].push({
                position: new THREE.Vector3(t.x, placementY, t.z),
                rotation: new THREE.Euler(0, t.rotationY, 0),
                scale: new THREE.Vector3(t.scale, t.scale, t.scale),
            });
        }

        // Split each tree type's instances into near (full mesh) and far
        // (cross-billboard impostor). The cutoff is purely distance-based so
        // it works for any scene's zone layout. ~250m matches "no longer
        // resolvable as individual triangles" from the typical play camera.
        // Far impostors drop ~99% of triangles per distant tree, which is
        // the single biggest tree-tris cut available short of full octahedral
        // impostors.
        // Cycle 7 Phase 2a (round 2): raised again 280→400m. The threshold
        // is distance-from-origin (set once at scene load) not distance-
        // from-camera, so any tree past it is a billboard regardless of
        // where the player is. OC's 380m island radius means trees at
        // 280–380m on the playable disc were billboards. 400m covers the
        // entire island; only the horizon-zone trees (radius >400m) stay
        // billboards. RH (safe radius ~161m) and Field unaffected.
        const FAR_LOD_DIST = 400;
        const nearByType = { tree1: [], tree2: [], pine: [] };
        const farByType  = { tree1: [], tree2: [], pine: [] };
        Object.entries(treeInstances).forEach(([treeType, instances]) => {
            instances.forEach(inst => {
                const r = Math.hypot(inst.position.x, inst.position.z);
                (r > FAR_LOD_DIST ? farByType : nearByType)[treeType].push(inst);
            });
        });

        // Create instanced meshes for each tree type (near = full GLB mesh).
        const instancedMeshes = [];
        Object.entries(nearByType).forEach(([treeType, instances]) => {
            if (instances.length === 0 || !this.models.trees[treeType]) return;

            const model = this.models.trees[treeType];
            const dummy = new THREE.Object3D();

            model.traverse(child => {
                if (child.isMesh) {
                    const instancedMesh = new THREE.InstancedMesh(
                        child.geometry,
                        child.material,
                        instances.length
                    );

                    instances.forEach((instance, i) => {
                        dummy.position.copy(instance.position);
                        dummy.rotation.copy(instance.rotation);
                        dummy.scale.copy(instance.scale);
                        dummy.updateMatrix();
                        instancedMesh.setMatrixAt(i, dummy.matrix);
                    });

                    instancedMesh.castShadow = !this.isMobile;
                    instancedMesh.receiveShadow = true;
                    instancedMesh.instanceMatrix.needsUpdate = true;
                    instancedMesh.frustumCulled = false;

                    this.scene.add(instancedMesh);
                    instancedMeshes.push(instancedMesh);
                }
            });

            console.log(`[TERRAIN] Created ${instances.length} ${treeType} mesh instances (near)`);
        });

        // Build cross-billboard impostors for far trees. One InstancedMesh per
        // tree type, sharing a baked texture of that GLB seen from the side.
        const billboardMeshes = await this._buildFarTreeBillboards(farByType);
        billboardMeshes.forEach(m => instancedMeshes.push(m));

        this.trees = instancedMeshes;
        const nearTotal = Object.values(nearByType).reduce((s, a) => s + a.length, 0);
        const farTotal = Object.values(farByType).reduce((s, a) => s + a.length, 0);
        console.log(`[TERRAIN] Total trees: ${nearTotal} near (mesh) + ${farTotal} far (impostor) = ${nearTotal + farTotal}`);

        return instancedMeshes;
    }

    /**
     * Build cross-billboard InstancedMeshes for distant trees. Each tree
     * type gets one InstancedMesh whose geometry is two perpendicular
     * textured quads, sampled from a one-time render of the GLB to a
     * RenderTarget. The result is ~8 triangles per far tree instead of
     * thousands, with reasonable visual fidelity from the play camera.
     *
     * @param {Object<string, Array>} farByType
     * @returns {Promise<THREE.InstancedMesh[]>}
     * @private
     */
    async _buildFarTreeBillboards(farByType) {
        const renderer = getSceneManager()?.getRenderer();
        if (!renderer) {
            console.warn('[TERRAIN] No renderer available for tree impostor bake; skipping far-tree LOD');
            return [];
        }

        const out = [];
        // Cache baked impostors per tree type — survives dispose() like the
        // models cache. Cycle 11 Phase 1 A8 finding: re-baking on each scene
        // swap leaks one WebGLRenderTarget framebuffer per tree species per
        // swap (~5 GL textures per cycle). Reuse instead.
        if (!this._bakeImpostorCache) this._bakeImpostorCache = new Map();

        for (const [treeType, instances] of Object.entries(farByType)) {
            if (instances.length === 0 || !this.models.trees[treeType]) continue;

            let baked = this._bakeImpostorCache.get(treeType);
            if (!baked) {
                baked = this._bakeTreeImpostor(this.models.trees[treeType], renderer);
                if (!baked) continue;
                this._bakeImpostorCache.set(treeType, baked);
            }

            // Cross-billboard geometry uses the GLB's bbox Y-range so that
            // per-instance placement (which uses the same `placementY = treeY
            // + (-bbox.min.y) * scale` offset as the mesh path) lands the
            // billboard's base on terrain, top of model at top of quad.
            const geo = this._createCrossBillboardGeometry(baked.width, baked.bboxMinY, baked.bboxMaxY);
            const mat = new THREE.MeshBasicMaterial({
                map: baked.texture,
                transparent: true,
                alphaTest: 0.4,
                side: THREE.DoubleSide,
                depthWrite: true,
                fog: true
            });

            const inst = new THREE.InstancedMesh(geo, mat, instances.length);
            const dummy = new THREE.Object3D();
            instances.forEach((instance, i) => {
                dummy.position.copy(instance.position);
                dummy.rotation.copy(instance.rotation);
                dummy.scale.copy(instance.scale);
                dummy.updateMatrix();
                inst.setMatrixAt(i, dummy.matrix);
            });
            inst.castShadow = false;
            inst.receiveShadow = false;
            inst.instanceMatrix.needsUpdate = true;
            inst.frustumCulled = false;

            this.scene.add(inst);
            out.push(inst);
            console.log(`[TERRAIN] Created ${instances.length} ${treeType} billboard instances (far)`);
        }
        return out;
    }

    /**
     * Render a tree GLB to an offscreen RenderTarget, viewed from the side
     * with an orthographic camera, transparent background. Returns a texture
     * + the model's bounding-box width/height so the billboard quad matches
     * the GLB's footprint.
     *
     * @param {THREE.Object3D} model
     * @param {THREE.WebGLRenderer} renderer
     * @returns {{texture: THREE.Texture, width: number, height: number, baseY: number} | null}
     * @private
     */
    _bakeTreeImpostor(model, renderer) {
        const bakeScene = new THREE.Scene();
        bakeScene.background = null;
        const ambient = new THREE.AmbientLight(0xffffff, 0.55);
        bakeScene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
        dirLight.position.set(2, 4, 3);
        bakeScene.add(dirLight);

        const treeClone = model.clone(true);
        treeClone.traverse(node => {
            if (node.isMesh) {
                node.castShadow = false;
                node.receiveShadow = false;
            }
        });
        bakeScene.add(treeClone);

        const box = new THREE.Box3().setFromObject(treeClone);
        if (!isFinite(box.min.x) || box.isEmpty()) return null;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Pad the camera frustum slightly so the tree silhouette doesn't
        // clip against the texture edges (alphaTest would chew off branch
        // tips otherwise).
        const halfW = Math.max(size.x, size.z) * 0.55;
        const halfH = size.y * 0.55;
        const aspect = halfW / halfH;
        const TEX = 512;
        const texW = aspect >= 1 ? TEX : Math.round(TEX * aspect);
        const texH = aspect >= 1 ? Math.round(TEX / aspect) : TEX;

        const cam = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 200);
        cam.position.set(center.x, center.y, box.max.z + 50);
        cam.lookAt(center.x, center.y, center.z);

        const target = new THREE.WebGLRenderTarget(texW, texH, {
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
            minFilter: THREE.LinearMipmapLinearFilter,
            magFilter: THREE.LinearFilter,
            generateMipmaps: true
        });

        const prevTarget = renderer.getRenderTarget();
        const prevClearColor = new THREE.Color();
        renderer.getClearColor(prevClearColor);
        const prevClearAlpha = renderer.getClearAlpha();

        renderer.setRenderTarget(target);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, true);
        renderer.render(bakeScene, cam);

        renderer.setRenderTarget(prevTarget);
        renderer.setClearColor(prevClearColor, prevClearAlpha);

        // Dispose the clone (geometries/materials are still referenced by the
        // original `model`, so DON'T dispose them — only release the clone's
        // node objects; GC handles the rest).
        bakeScene.remove(treeClone);

        return {
            texture: target.texture,
            width: halfW * 2,
            bboxMinY: box.min.y,
            bboxMaxY: box.max.y
        };
    }

    /**
     * Three textured quads arranged at 0°, 60°, 120° around the Y axis. Any
     * view direction is within ~30° of one quad's normal, so the tree silhouette
     * stays full-width regardless of camera angle (vs. the 2-quad cross which
     * had a thin "edge-on" reading from 45°-and-multiples).
     *
     * Y range matches the GLB's bbox so the mesh and billboard paths share
     * the same per-instance placement formula.
     *
     * @param {number} width
     * @param {number} y0  Lower Y in unit scale (matches model bbox.min.y)
     * @param {number} y1  Upper Y in unit scale (matches model bbox.max.y)
     * @returns {THREE.BufferGeometry}
     * @private
     */
    _createCrossBillboardGeometry(width, y0, y1) {
        const halfW = width / 2;
        const positions = [];
        const uvs = [];
        // 3 planes at 0°, 60°, 120°. Each plane is 2 triangles (6 verts).
        for (let q = 0; q < 3; q++) {
            const angle = (q * Math.PI) / 3;
            const ax = Math.cos(angle) * halfW;
            const az = Math.sin(angle) * halfW;
            positions.push(
                -ax, y0, -az,    ax, y0, az,    ax, y1, az,
                -ax, y0, -az,    ax, y1, az,   -ax, y1, -az
            );
            uvs.push(
                0, 0,   1, 0,   1, 1,
                0, 0,   1, 1,   0, 1
            );
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.computeVertexNormals();
        return geo;
    }
    
    async addEnvironmentDetails() {
        if (!this.modelsLoaded) {
            console.warn('Models not loaded yet. Loading models...');
            await this.loadModels();
        }

        // Reset rock-position tracker — populated as rocks are placed below.
        // `createTrees` reads this list to exclude tree candidates that would
        // spawn on top of a big rock formation.
        this.rockPositions = [];

        const rockInstances = {
            rock1: [], // small rocks
            rock2: [], // medium rocks
            rock3: []  // large rocks/formations
        };
        
        // Improved rock generation using geological formations
        const createRockFormation = (centerX, centerZ, formationType = 'cluster') => {
            const rocks = [];
            
            if (formationType === 'cluster') {
                // Circular cluster with density falloff
                const numRocks = 5 + Math.floor(Math.random() * 10);
                const radius = 30 + Math.random() * 40;
                
                for (let i = 0; i < numRocks; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    // Use gaussian distribution for more natural clustering
                    const dist = Math.abs(randomGaussian()) * radius * 0.5;
                    const x = centerX + Math.cos(angle) * dist;
                    const z = centerZ + Math.sin(angle) * dist;
                    
                    rocks.push({ x, z, scale: 0.7 + Math.random() * 0.6 });
                }
            } else if (formationType === 'line') {
                // Linear formation (like a ridge)
                const length = 50 + Math.random() * 100;
                const angle = Math.random() * Math.PI * 2;
                const numRocks = 8 + Math.floor(Math.random() * 12);
                
                for (let i = 0; i < numRocks; i++) {
                    const t = (i / (numRocks - 1)) - 0.5;
                    const offset = (Math.random() - 0.5) * 20;
                    const x = centerX + Math.cos(angle) * t * length + Math.sin(angle) * offset;
                    const z = centerZ + Math.sin(angle) * t * length + Math.cos(angle) * offset;
                    
                    rocks.push({ x, z, scale: 0.8 + Math.random() * 0.4 });
                }
            } else if (formationType === 'field') {
                // Scattered field with variable density
                const width = 80 + Math.random() * 80;
                const height = 80 + Math.random() * 80;
                const numRocks = 15 + Math.floor(Math.random() * 20);
                
                for (let i = 0; i < numRocks; i++) {
                    const x = centerX + (Math.random() - 0.5) * width;
                    const z = centerZ + (Math.random() - 0.5) * height;
                    
                    rocks.push({ x, z, scale: 0.6 + Math.random() * 0.8 });
                }
            }
            
            return rocks;
        };
        
        // Helper for gaussian distribution
        const randomGaussian = () => {
            let u = 0, v = 0;
            while (u === 0) u = Math.random();
            while (v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        };
        
        // Cycle 5+ island scenes: rocks stay on the land (inside the safe
        // radius), corral kept clear. Same inversion as createTrees.
        const islandBoundary = this.sceneDef?.boundary?.kind === 'island' ? this.sceneDef.boundary : null;

        // Generate rock formations in different zones.
        // Island scenes get fewer + smaller rocks (no horizon zone since
        // that's water; no boulders/rock3-scale since the playtest 2026-04-25
        // flagged the big rocks as unwelcome). Per-rock-type biasing
        // (drop rock3) is applied later when rockType is picked.
        const zones = islandBoundary
            ? [
                // Only nearField + midField on islands (rest is water)
                { zone: this.zones.nearField, formations: 1, types: ['cluster'], scaleRange: { min: 4, max: 7 } },
                { zone: this.zones.midField, formations: 2, types: ['cluster'], scaleRange: { min: 5, max: 9 } },
            ]
            : [
                { zone: this.zones.nearField, formations: 2, types: ['cluster'], scaleRange: { min: 8, max: 15 } },
                { zone: this.zones.midField, formations: 4, types: ['cluster', 'line'], scaleRange: { min: 10, max: 20 } },
                { zone: this.zones.farField, formations: 6, types: ['cluster', 'line', 'field'], scaleRange: { min: 15, max: 30 } },
                { zone: this.zones.horizon, formations: 8, types: ['field', 'line'], scaleRange: { min: 25, max: 50 } }
            ];

        // Get current play area for rock exclusion
        const playArea = this.zones.playArea;
        const corral = this.sceneDef?.corral || null;
        const islandSafeRadius = islandBoundary
            ? islandBoundary.radius - islandBoundary.falloff - 4
            : 0;

        const isInWater = (x, z) => {
            if (!islandBoundary) return false;
            const dx = x - islandBoundary.center.x;
            const dz = z - islandBoundary.center.z;
            return (dx * dx + dz * dz) > islandSafeRadius * islandSafeRadius;
        };
        const isInCorralKeepout = (x, z) => {
            if (!corral) return false;
            const dx = x - corral.center.x;
            const dz = z - corral.center.z;
            const r = corral.radius + 8;  // bigger margin for rocks (large footprint)
            return (dx * dx + dz * dz) < r * r;
        };

        zones.forEach(({ zone, formations, types, scaleRange }) => {
            for (let f = 0; f < formations; f++) {
                const centerX = zone.minX + Math.random() * (zone.maxX - zone.minX);
                const centerZ = zone.minZ + Math.random() * (zone.maxZ - zone.minZ);

                if (islandBoundary) {
                    // Island scene — must be on land, away from corral
                    if (isInWater(centerX, centerZ)) continue;
                    if (isInCorralKeepout(centerX, centerZ)) continue;
                } else {
                    // Legacy rect scene — exclude play area
                    const buffer = 50;
                    if (centerX >= playArea.minX - buffer && centerX <= playArea.maxX + buffer &&
                        centerZ >= playArea.minZ - buffer && centerZ <= playArea.maxZ + buffer) continue;
                }

                // Skip if in farm house area
                if (this.isInFarmHouseArea(centerX, centerZ)) continue;

                const formationType = types[Math.floor(Math.random() * types.length)];
                const formation = createRockFormation(centerX, centerZ, formationType);

                formation.forEach(rock => {
                    if (islandBoundary) {
                        // Island scene — drop individual rocks that drifted outside the safe radius or into the corral
                        if (isInWater(rock.x, rock.z)) return;
                        if (isInCorralKeepout(rock.x, rock.z)) return;
                    } else {
                        // Legacy rect — too-close-to-play-area exclusion.
                        // Cycle 11: tightened buffer 20 -> 40 after a playtest
                        // flagged rocks landing on the inside edge of the
                        // perimeter fence on Home Field. Pair with the per-
                        // formation centerBuffer of 50 above so a cluster
                        // straddling the boundary trims to outside-only.
                        const rockBuffer = 40;
                        if (rock.x >= playArea.minX - rockBuffer && rock.x <= playArea.maxX + rockBuffer &&
                            rock.z >= playArea.minZ - rockBuffer && rock.z <= playArea.maxZ + rockBuffer) return;
                    }

                    // Skip if in farm house area
                    if (this.isInFarmHouseArea(rock.x, rock.z)) return;
                    
                    // Determine rock type based on size.
                    // Island scenes skip rock3 (boulders) entirely — playtest
                    // 2026-04-25 flagged the big formations as unwelcome on
                    // a tight playable island. Bias toward rock1 (small).
                    const size = Math.random();
                    let rockType;
                    if (islandBoundary) {
                        rockType = size < 0.75 ? 'rock1' : 'rock2';
                    } else {
                        if (size < 0.5) rockType = 'rock1';
                        else if (size < 0.8) rockType = 'rock2';
                        else rockType = 'rock3';
                    }
                    
                    // Calculate final scale
                    const baseScale = scaleRange.min + Math.random() * (scaleRange.max - scaleRange.min);
                    const finalScale = baseScale * rock.scale;

                    // Always partially bury rocks so the bottom of the silhouette
                    // sinks below the ground plane. Cycle 11: changed from
                    // 70%-not-buried to always-buried after the playtest flagged
                    // floaters whose GLB origin sat above the visible base.
                    // _groundY mirrors the terrain's radial falloff so rocks in
                    // outer zones (past the heightfield) match the flat skirt.
                    const baseY = this._groundY(rock.x, rock.z);
                    const yOffset = baseY - finalScale * (0.10 + Math.random() * 0.10);

                    rockInstances[rockType].push({
                        position: new THREE.Vector3(rock.x, yOffset, rock.z),
                        rotation: new THREE.Euler(
                            Math.random() * Math.PI * 0.3,
                            Math.random() * Math.PI * 2,
                            Math.random() * Math.PI * 0.3
                        ),
                        scale: new THREE.Vector3(finalScale, finalScale * 0.7, finalScale * 1.2)
                    });

                    // Record this rock's footprint so a subsequent createTrees()
                    // call can exclude tree placements over it. Footprint
                    // radius approximates the rock's max XY-plane extent
                    // (longest of x or z scale axes).
                    //
                    // Cycle 6 Phase 2 / Q3 (fallback): isObstacle marks rocks
                    // big enough to collide with (per-rock multiplier ≥ 0.8).
                    // Smaller rocks remain decorative — including them as
                    // colliders made the world feel like an obstacle course.
                    // Visual footprint radius covers tree-exclusion; collider
                    // radius is half the visual since rocks are partially
                    // buried + rounded, so the effective trip footprint is
                    // tighter than the silhouette.
                    this.rockPositions.push({
                        x: rock.x,
                        z: rock.z,
                        radius: finalScale * 1.2,
                        isObstacle: rock.scale >= 0.8,
                        colliderRadius: finalScale * 0.55
                    });
                });
            }
        });
        
        // Create instanced meshes for each rock type
        const instancedMeshes = [];
        
        Object.entries(rockInstances).forEach(([rockType, instances]) => {
            if (instances.length === 0 || !this.models.rocks[rockType]) return;
            
            const model = this.models.rocks[rockType];
            const dummy = new THREE.Object3D();
            
            // Get all meshes from the model
            model.traverse(child => {
                if (child.isMesh) {
                    // Keep original materials - just use LOD and culling for mobile optimization
                    const instancedMesh = new THREE.InstancedMesh(
                        child.geometry,
                        child.material,
                        instances.length
                    );
                    
                    // Set up instances
                    instances.forEach((instance, i) => {
                        dummy.position.copy(instance.position);
                        dummy.rotation.copy(instance.rotation);
                        dummy.scale.copy(instance.scale);
                        dummy.updateMatrix();
                        instancedMesh.setMatrixAt(i, dummy.matrix);
                    });
                    
                    // Disable rock shadows on mobile
                    instancedMesh.castShadow = !this.isMobile;
                    instancedMesh.receiveShadow = true;
                    instancedMesh.instanceMatrix.needsUpdate = true;
                    
                    this.scene.add(instancedMesh);
                    instancedMeshes.push(instancedMesh);
                }
            });
            
            console.log(`[BUILD] Created ${instances.length} ${rockType} instances`);
        });
        
        this.rocks = instancedMeshes;
        this.environmentDetails = instancedMeshes; // Keep compatibility
        const totalRocks = Object.values(rockInstances).reduce((sum, arr) => sum + arr.length, 0);
        console.log(`[BUILD] Total rocks created: ${totalRocks} using instanced rendering`);
        
        return instancedMeshes;
    }
    
    updateGrassAnimation(deltaTime, camera, playerPosition, entities) {
        // Use new grass system if available
        if (this.grassSystem) {
            // Update interactors (player + nearby sheep + other dogs)
            if (entities) {
                this.grassSystem.updateInteractors(entities);
            }

            // Update grass system with time, camera, and player position
            this.grassSystem.update(deltaTime || 0.016, camera, playerPosition);
        } else {
            // Legacy: Only update animation on desktop
            if (!this.isMobile && this.grassMaterial && this.grassMaterial.uniforms.time) {
                this.grassMaterial.uniforms.time.value = performance.now() * 0.001;
            }
        }
    }

    /**
     * Get grass system stats for performance monitoring
     */
    getGrassStats() {
        if (this.grassSystem) {
            return this.grassSystem.getStats();
        }
        return {
            totalClumps: 0,
            visibleClumps: 0,
            effectiveBlades: this.grassInstanceCount
        };
    }
    
    /**
     * Update LOD and frustum culling based on camera position
     * @param {THREE.Camera} camera - The active camera
     * @param {THREE.Vector3} playerPosition - Current player position
     */
    updateLOD(camera, playerPosition) {
        if (!camera || !playerPosition) return;
        
        // Update frustum for culling
        this.frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.frustumMatrix);
        
        // Update grass LOD
        this.updateGrassLOD(playerPosition);
        
        // Update tree LOD
        this.updateTreeLOD(playerPosition);
    }
    
    /**
     * Update grass LOD based on distance from player
     * @param {THREE.Vector3} playerPosition - Current player position
     */
    updateGrassLOD(playerPosition) {
        if (!this.grassInstancedMesh) return;
        
        const grassCount = this.grassInstanceCount;
        const dummy = new THREE.Object3D();
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        
        // Track visible grass count for performance monitoring
        let visibleCount = 0;
        
        for (let i = 0; i < grassCount; i++) {
            this.grassInstancedMesh.getMatrixAt(i, matrix);
            position.setFromMatrixPosition(matrix);
            
            // Calculate distance from player
            const distance = position.distanceTo(playerPosition);
            
            // LOD logic
            if (distance < this.lodDistances.near) {
                // Near: Full visibility
                visibleCount++;
            } else if (distance < this.lodDistances.mid) {
                // Mid: Reduce density - show only every 4th grass blade
                if (i % 4 === 0) {
                    visibleCount++;
                } else {
                    // Hide by scaling to zero
                    dummy.position.setFromMatrixPosition(matrix);
                    dummy.rotation.setFromRotationMatrix(matrix);
                    dummy.scale.set(0, 0, 0);
                    dummy.updateMatrix();
                    this.grassInstancedMesh.setMatrixAt(i, dummy.matrix);
                }
            } else if (distance < this.lodDistances.far) {
                // Far: Show only every 10th grass blade
                if (i % 10 === 0) {
                    visibleCount++;
                } else {
                    // Hide by scaling to zero
                    dummy.position.setFromMatrixPosition(matrix);
                    dummy.rotation.setFromRotationMatrix(matrix);
                    dummy.scale.set(0, 0, 0);
                    dummy.updateMatrix();
                    this.grassInstancedMesh.setMatrixAt(i, dummy.matrix);
                }
            } else {
                // Beyond far: Hide all grass
                dummy.position.setFromMatrixPosition(matrix);
                dummy.rotation.setFromRotationMatrix(matrix);
                dummy.scale.set(0, 0, 0);
                dummy.updateMatrix();
                this.grassInstancedMesh.setMatrixAt(i, dummy.matrix);
            }
        }
        
        // Update instance matrix
        this.grassInstancedMesh.instanceMatrix.needsUpdate = true;
        
        // Log LOD status periodically
        if (Math.random() < 0.01) { // 1% chance to log
            console.log(`[GRASS] LOD: ${visibleCount}/${grassCount} visible (${Math.round(visibleCount/grassCount*100)}%)`);
        }
    }
    
    /**
     * Update tree LOD based on distance from player
     * @param {THREE.Vector3} playerPosition - Current player position
     */
    updateTreeLOD(playerPosition) {
        if (!this.trees || this.trees.length === 0) return;
        
        // For each tree instanced mesh
        this.trees.forEach(instancedMesh => {
            if (!instancedMesh || !instancedMesh.isInstancedMesh) return;
            
            const count = instancedMesh.count;
            const dummy = new THREE.Object3D();
            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const boundingSphere = new THREE.Sphere();
            
            for (let i = 0; i < count; i++) {
                instancedMesh.getMatrixAt(i, matrix);
                position.setFromMatrixPosition(matrix);
                
                // Simple frustum culling check
                boundingSphere.center.copy(position);
                boundingSphere.radius = 10; // Approximate tree radius
                
                const inFrustum = this.frustum.intersectsSphere(boundingSphere);
                
                if (!inFrustum) {
                    // Outside frustum - hide
                    dummy.position.setFromMatrixPosition(matrix);
                    dummy.rotation.setFromRotationMatrix(matrix);
                    dummy.scale.set(0, 0, 0);
                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(i, dummy.matrix);
                    continue;
                }
                
                // Calculate distance from player
                const distance = position.distanceTo(playerPosition);
                
                // LOD logic for trees
                if (distance < this.lodDistances.mid) {
                    // Near/Mid: Full visibility (trees stay visible longer than grass)
                    // Keep original matrix (do nothing)
                } else if (distance < this.lodDistances.far * 1.5) {
                    // Far: Reduce scale slightly for distant trees
                    dummy.position.setFromMatrixPosition(matrix);
                    dummy.rotation.setFromRotationMatrix(matrix);
                    const originalScale = Math.pow(matrix.determinant(), 1/3); // Extract uniform scale
                    const reducedScale = originalScale * 0.7;
                    dummy.scale.setScalar(reducedScale);
                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(i, dummy.matrix);
                } else {
                    // Beyond far: Hide trees
                    dummy.position.setFromMatrixPosition(matrix);
                    dummy.rotation.setFromRotationMatrix(matrix);
                    dummy.scale.set(0, 0, 0);
                    dummy.updateMatrix();
                    instancedMesh.setMatrixAt(i, dummy.matrix);
                }
            }
            
            // Update instance matrix
            instancedMesh.instanceMatrix.needsUpdate = true;
        });
    }
    
    getGrassMaterial() {
        return this.grassMaterial;
    }
    
    getGrassInstanceCount() {
        return this.grassInstanceCount;
    }

    /**
     * Estimate triangle counts for the terrain-owned meshes, broken down
     * by category for the PERF overlay. Called once post-init; not per-frame.
     * Returns { Terrain, Trees, Rocks, Mountains } with zeros for any
     * category that hasn't been built yet.
     * @returns {{Terrain: number, Trees: number, Rocks: number, Mountains: number}}
     */
    getTriangleBreakdown() {
        return {
            Terrain: countMeshTriangles(this.terrainMesh),
            Trees: sumInstancedMeshTriangles(this.trees),
            Rocks: sumInstancedMeshTriangles(this.rocks),
            Mountains: sumObjectTreeTriangles(this.mountains)
        };
    }

    /**
     * Simple robust LOD system - no complex culling, just basic distance scaling
     * @param {THREE.Vector3} playerPosition - Current player position
     */
    updateSimpleLOD(playerPosition) {
        if (!playerPosition) return;
        
        // Simple grass LOD - just reduce density at distance
        this.updateSimpleGrassLOD(playerPosition);
        
        // Update performance stats for monitoring
        if (this.isMobile && Math.random() < 0.01) { // 1% chance to log on mobile
            console.log(`[PERF] Simple LOD Active - Grass visible: ${this.cullingStats.grassVisible || 'all'}`);
        }
    }
    
    /**
     * Simple grass LOD - just hide some instances at distance, no complex matrix manipulation
     * @param {THREE.Vector3} playerPosition - Current player position
     */
    updateSimpleGrassLOD(playerPosition) {
        // On mobile, optionally reduce visible grass at distance
        // This is much simpler than before - just basic visibility toggling
        if (this.isMobile && this.grassInstancedMesh) {
            // For now, keep it simple and let the reduced instance count handle performance
            // Future: Could add simple distance-based visibility toggle here if needed
            this.cullingStats.grassVisible = this.grassInstanceCount;
        }
    }

    async addMountains() {
        // Mountains are intentionally absent. The previous procedural ring
        // (a flat annulus shader-displaced upward only) read as paper-thin
        // peaks with sky between them, and didn't relate to the heightfield
        // it was supposed to frame. Backdrop framing now comes from the
        // atmosphere/sky preset on each scene. A real horizon ring is
        // tracked as a future task (proper height-displaced skirt that the
        // play-area heightfield blends into).
        this.mountains = [];
        console.log('[BUILD] Mountains skipped (procedural ring removed)');
        return this.mountains;

        // Legacy code retained below for reference; bypassed by the early
        // return above. Will be deleted in a follow-up cleanup pass once
        // the procedural backdrop has soaked in production.
        // eslint-disable-next-line no-unreachable
        const mountainInstances = [];
        
        // Define mountain placement zones - straddling the terrain edge (500 units boundary)
        const mountainPlacements = [
            // North edge mountains - positioned to straddle the -500 boundary
            { x: -300, z: -500, scale: 100.0, rotation: 0, yOffset: -20 },
            { x: -100, z: -520, scale: 120.0, rotation: Math.PI * 0.25, yOffset: -25 },
            { x: 100, z: -500, scale: 110.0, rotation: Math.PI * 0.5, yOffset: -20 },
            { x: 300, z: -510, scale: 130.0, rotation: Math.PI * 0.75, yOffset: -30 },
            
            // South edge mountains - straddling the +500 boundary
            { x: -300, z: 500, scale: 110.0, rotation: Math.PI * 1.25, yOffset: -25 },
            { x: -100, z: 520, scale: 140.0, rotation: Math.PI * 1.5, yOffset: -35 },
            { x: 100, z: 500, scale: 120.0, rotation: Math.PI * 1.75, yOffset: -25 },
            { x: 300, z: 510, scale: 125.0, rotation: 0, yOffset: -30 },
            
            // East edge mountains - straddling the +500 boundary
            { x: 500, z: -300, scale: 105.0, rotation: Math.PI * 0.5, yOffset: -20 },
            { x: 520, z: -100, scale: 115.0, rotation: Math.PI * 0.75, yOffset: -25 },
            { x: 500, z: 100, scale: 110.0, rotation: Math.PI, yOffset: -20 },
            { x: 510, z: 300, scale: 120.0, rotation: Math.PI * 1.25, yOffset: -30 },
            
            // West edge mountains - straddling the -500 boundary
            { x: -500, z: -300, scale: 110.0, rotation: Math.PI * 1.75, yOffset: -25 },
            { x: -520, z: -100, scale: 125.0, rotation: 0, yOffset: -30 },
            { x: -500, z: 100, scale: 115.0, rotation: Math.PI * 0.25, yOffset: -25 },
            { x: -510, z: 300, scale: 135.0, rotation: Math.PI * 0.5, yOffset: -35 },
            
            // Corner mountains for dramatic effect
            { x: -500, z: -500, scale: 150.0, rotation: Math.PI * 0.125, yOffset: -40 },
            { x: 500, z: -500, scale: 145.0, rotation: Math.PI * 0.375, yOffset: -40 },
            { x: 500, z: 500, scale: 155.0, rotation: Math.PI * 0.625, yOffset: -45 },
            { x: -500, z: 500, scale: 140.0, rotation: Math.PI * 0.875, yOffset: -35 }
        ];
        
        // Create mountain instances
        mountainPlacements.forEach((placement, index) => {
            const mountainType = index % 2 === 0 ? 'mountain1' : 'mountain2';
            const model = this.models.mountains[mountainType];
            if (!model) return;

            const mountainGroup = model.clone();

            // Apply transformations with y offset for partial burial
            mountainGroup.position.set(placement.x, placement.yOffset || 0, placement.z);
            mountainGroup.rotation.y = placement.rotation;
            mountainGroup.scale.setScalar(placement.scale);

            // Distance from origin (used by the atmospheric tint below).
            const distance = Math.sqrt(placement.x * placement.x + placement.z * placement.z);

            // Simple LOD - reduce detail for far mountains
            mountainGroup.traverse(child => {
                if (child.isMesh) {
                    child.castShadow = false; // Mountains don't cast shadows (too far)
                    child.receiveShadow = true;
                    
                    // Add fog material adjustment
                    if (child.material) {
                        child.material = child.material.clone();
                        child.material.fog = true;
                        
                        // Slightly blue tint for atmospheric perspective
                        if (distance > 600) {
                            child.material.color.lerp(new THREE.Color(0x87CEEB), 0.2);
                        }
                    }
                }
            });
            
            this.scene.add(mountainGroup);
            mountainInstances.push(mountainGroup);
        });
        
        // Add rolling hills using improved placement
        const hillFormations = [
            // Create hill ranges between mountains
            { start: { x: -400, z: -400 }, end: { x: -200, z: -450 }, count: 5 },
            { start: { x: 200, z: -450 }, end: { x: 400, z: -400 }, count: 5 },
            { start: { x: -400, z: 400 }, end: { x: -200, z: 450 }, count: 5 },
            { start: { x: 200, z: 450 }, end: { x: 400, z: 400 }, count: 5 },
            // Side ranges
            { start: { x: -450, z: -200 }, end: { x: -400, z: 200 }, count: 6 },
            { start: { x: 450, z: -200 }, end: { x: 400, z: 200 }, count: 6 }
        ];
        
        hillFormations.forEach(formation => {
            for (let i = 0; i < formation.count; i++) {
                const t = i / (formation.count - 1);
                const x = formation.start.x + (formation.end.x - formation.start.x) * t;
                const z = formation.start.z + (formation.end.z - formation.start.z) * t;
                
                // Add some randomness to position
                const offsetX = (Math.random() - 0.5) * 60;
                const offsetZ = (Math.random() - 0.5) * 60;
                
                const finalX = x + offsetX;
                const finalZ = z + offsetZ;
                
                // Scale hills appropriately
                const scale = 40.0 + Math.random() * 40.0;
                const mountainType = Math.random() < 0.5 ? 'mountain1' : 'mountain2';

                const model = this.models.mountains[mountainType];
                if (!model) continue;

                const hill = model.clone();
                hill.position.set(finalX, -scale * 0.4, finalZ); // Partially bury hills
                hill.rotation.y = Math.random() * Math.PI * 2;
                hill.scale.setScalar(scale);
            
                hill.traverse(child => {
                    if (child.isMesh) {
                        child.castShadow = false;
                        child.receiveShadow = true;
                        
                        if (child.material) {
                            child.material = child.material.clone();
                            child.material.fog = true;
                            child.material.color.lerp(new THREE.Color(0x87CEEB), 0.2);
                        }
                    }
                });
                
                this.scene.add(hill);
                mountainInstances.push(hill);
            }
        });
        
        this.mountains = mountainInstances;
        console.log(`[BUILD] Created ${mountainInstances.length} mountain instances`);
        
        return mountainInstances;
    }
    
    /**
     * Remove all existing trees from the scene
     */
    clearTrees() {
        console.log(`[BUILD] Removing ${this.trees.length} existing trees`);
        
        this.trees.forEach(tree => {
            this.scene.remove(tree);
            // Dispose of geometry and materials to free memory
            if (tree.geometry) tree.geometry.dispose();
            if (tree.material) {
                if (Array.isArray(tree.material)) {
                    tree.material.forEach(mat => mat.dispose());
                } else {
                    tree.material.dispose();
                }
            }
        });
        
        this.trees = []; // Clear the tracking array
    }
    
    /**
     * Add farm house to the scene in the northwest corner
     */
    async addFarmHouse() {
        // Cycle 5+: scenes with farmHouse: null (or island scenes that
        // didn't relocate the farmhouse onto the island) skip this entirely.
        if (this.sceneDef && (this.sceneDef.farmHouse === null || this.sceneDef.farmHouse === undefined)) {
            console.log('[TERRAIN] Scene has no farmhouse — skipping');
            return null;
        }

        if (!this.modelsLoaded) {
            console.warn('Models not loaded yet. Loading models...');
            await this.loadModels();
        }

        const farmHouseModel = this.models.buildings.farmhouse;
        if (!farmHouseModel) {
            console.error('[ERROR] Farm house model not found');
            return null;
        }
        
        // Clone the farm house model
        const farmHouse = farmHouseModel.clone();
        
        // Position the farm house in the northwest corner
        // Behind the pen (positive Z relative to gate) and to the left (negative X)
        const farmY = this._groundY(this.farmHousePosition.x, this.farmHousePosition.z);

        // Scale the farm house appropriately - smaller and more realistic
        const scale = 1.0; // Further reduced for better proportions (2x smaller)
        farmHouse.scale.setScalar(scale);

        // Compensate for GLB origin offset so the foundation sits on terrain.
        const baseOffset = farmHouseModel.userData?.modelBaseYOffset ?? 0;
        farmHouse.position.set(
            this.farmHousePosition.x,
            farmY + baseOffset * scale,
            this.farmHousePosition.z
        );
        
        // Rotate to face the pen area - facing southeast toward the pen
        farmHouse.rotation.y = Math.PI * 1.25; // 225-degree rotation to face southeast
        
        // Configure shadows and materials
        farmHouse.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
                
                // Ensure materials work with fog
                if (child.material) {
                    child.material.fog = true;
                }
            }
        });
        
        // Add to scene
        this.scene.add(farmHouse);
        this.buildings.push(farmHouse);
        
        console.log(`[TERRAIN] Farm house added at position (${this.farmHousePosition.x}, ${this.farmHousePosition.z}) with clearing area`);
        
        return farmHouse;
    }
    
    /**
     * Check if a position is within the farm house exclusion area
     */
    isInFarmHouseArea(x, z) {
        return x >= this.farmHouseExclusionArea.minX &&
               x <= this.farmHouseExclusionArea.maxX &&
               z >= this.farmHouseExclusionArea.minZ &&
               z <= this.farmHouseExclusionArea.maxZ;
    }

    /**
     * Set dynamic bounds for the terrain (used for sandbox/different game modes)
     * @param {Object} bounds - The new bounds { minX, maxX, minZ, maxZ }
     * @param {Object} pasture - The new pasture area { minX, maxX, minZ, maxZ }
     */
    setDynamicBounds(bounds, pasture) {
        if (bounds) {
            // Update the play area zone based on new bounds
            this.zones.playArea = {
                minX: bounds.minX,
                maxX: bounds.maxX,
                minZ: bounds.minZ,
                maxZ: bounds.maxZ
            };
            console.log('[TERRAIN] Updated play area bounds:', this.zones.playArea);

            // Update farmhouse position based on new bounds
            // Position it beyond the northeast corner of the field
            this.farmHousePosition = {
                x: bounds.maxX + 80,
                z: bounds.maxZ + 60
            };

            // Update farmhouse exclusion area
            this.farmHouseExclusionArea = {
                minX: this.farmHousePosition.x - 40,
                maxX: this.farmHousePosition.x + 40,
                minZ: this.farmHousePosition.z - 40,
                maxZ: this.farmHousePosition.z + 40
            };
            console.log('[TERRAIN] Updated farmhouse position:', this.farmHousePosition);

            // Actually MOVE the existing farmhouse to the new position
            this.updateFarmhousePosition();
        }

        if (pasture) {
            // Store pasture for exclusion in grass/tree placement
            this.currentPasture = pasture;
            console.log('[TERRAIN] Updated pasture area:', pasture);
        }

        // Update grass system exclusion zones if available
        if (this.grassSystem) {
            // Clear existing exclusion zones and add updated ones
            this.grassSystem.exclusionZones = [];

            // Add farmhouse exclusion
            this.grassSystem.addExclusionZone(
                this.farmHouseExclusionArea.minX,
                this.farmHouseExclusionArea.maxX,
                this.farmHouseExclusionArea.minZ,
                this.farmHouseExclusionArea.maxZ
            );

            // Add pasture exclusion if available (no grass in pen)
            if (pasture) {
                if (pasture.edgeAngle !== undefined && pasture.edgeAngle !== 0) {
                    // Rotated pasture for custom shapes
                    const centerX = (pasture.minX + pasture.maxX) / 2;
                    const centerZ = (pasture.minZ + pasture.maxZ) / 2;
                    const width = pasture.maxX - pasture.minX;
                    const depth = pasture.maxZ - pasture.minZ;
                    this.grassSystem.addRotatedExclusionZone(centerX, centerZ, width, depth, pasture.edgeAngle);
                } else {
                    // Axis-aligned pasture
                    this.grassSystem.addExclusionZone(
                        pasture.minX,
                        pasture.maxX,
                        pasture.minZ,
                        pasture.maxZ
                    );
                }
            }

            // NOTE: We want grass INSIDE the field, so no bounds exclusion
            console.log('[TERRAIN] Updated grass exclusion zones');
        }
    }

    /**
     * Update the position of the existing farmhouse
     */
    updateFarmhousePosition() {
        if (this.buildings && this.buildings.length > 0) {
            // Find the farmhouse (first building)
            const farmhouse = this.buildings[0];
            if (farmhouse) {
                const farmY = this._groundY(this.farmHousePosition.x, this.farmHousePosition.z);
                farmhouse.position.set(this.farmHousePosition.x, farmY, this.farmHousePosition.z);
                console.log(`[TERRAIN] Moved farmhouse to (${this.farmHousePosition.x}, ${this.farmHousePosition.z})`);
            }
        }
    }

    /**
     * Clear and rebuild environment for new bounds
     * Call this when switching between game modes with different field sizes
     */
    async rebuildEnvironment(bounds, pasture) {
        console.log('[TERRAIN] Rebuilding environment for new bounds');

        // Update bounds first (this updates exclusion zones but doesn't regenerate)
        if (bounds) {
            this.zones.playArea = {
                minX: bounds.minX,
                maxX: bounds.maxX,
                minZ: bounds.minZ,
                maxZ: bounds.maxZ
            };

            this.farmHousePosition = {
                x: bounds.maxX + 80,
                z: bounds.maxZ + 60
            };

            this.farmHouseExclusionArea = {
                minX: this.farmHousePosition.x - 40,
                maxX: this.farmHousePosition.x + 40,
                minZ: this.farmHousePosition.z - 40,
                maxZ: this.farmHousePosition.z + 40
            };

            // Move existing farmhouse
            this.updateFarmhousePosition();
        }

        if (pasture) {
            this.currentPasture = pasture;
        }

        // Clear existing trees and rocks
        this.clearTrees();
        this.clearRocks();

        // Regenerate grass with new exclusion zones
        await this.regenerateGrass(bounds, pasture);

        // Rebuild trees and rocks with new exclusion zones
        await this.createTrees();
        await this.addEnvironmentDetails();

        console.log('[TERRAIN] Environment rebuild complete');
    }

    /**
     * Regenerate the grass system with new exclusion zones
     */
    async regenerateGrass(bounds, pasture) {
        console.log('[TERRAIN] Regenerating grass with new exclusion zones');

        // Dispose old grass system
        if (this.grassSystem) {
            this.grassSystem.dispose();
            this.grassSystem = null;
        }

        // Create new grass system
        this.grassSystem = new GrassSystem(this.scene, this.isMobile, this.sceneDef?.grass, this.heightfield, this.sceneDef?.boundary ?? null);

        // Add farmhouse exclusion zone
        this.grassSystem.addExclusionZone(
            this.farmHouseExclusionArea.minX,
            this.farmHouseExclusionArea.maxX,
            this.farmHouseExclusionArea.minZ,
            this.farmHouseExclusionArea.maxZ
        );

        // Add pasture exclusion zone (no grass in the pen area)
        if (pasture) {
            if (pasture.edgeAngle !== undefined && pasture.edgeAngle !== 0) {
                // Rotated pasture for custom shapes
                const centerX = (pasture.minX + pasture.maxX) / 2;
                const centerZ = (pasture.minZ + pasture.maxZ) / 2;
                const width = pasture.maxX - pasture.minX;
                const depth = pasture.maxZ - pasture.minZ;
                this.grassSystem.addRotatedExclusionZone(centerX, centerZ, width, depth, pasture.edgeAngle);
                console.log(`[TERRAIN] Added rotated pasture exclusion: center(${centerX.toFixed(1)}, ${centerZ.toFixed(1)}), size(${width}x${depth}), angle=${pasture.edgeAngle.toFixed(2)}rad`);
            } else {
                // Axis-aligned pasture
                this.grassSystem.addExclusionZone(
                    pasture.minX,
                    pasture.maxX,
                    pasture.minZ,
                    pasture.maxZ
                );
            }
        }

        // NOTE: We DO want grass inside the play area/field!
        // Only exclude farmhouse and pasture

        // Initialize the new grass system
        await this.grassSystem.init();

        // Update reference
        this.grassMaterial = this.grassSystem.grassMaterial;
        const stats = this.grassSystem.getStats();
        this.grassInstanceCount = stats.totalClumps * (this.isMobile ? 3 : 5);

        console.log(`[TERRAIN] Grass regenerated: ${stats.totalClumps} clumps`);
    }

    /**
     * Remove all existing rocks from the scene
     */
    clearRocks() {
        console.log(`[TERRAIN] Removing ${this.rocks.length} existing rocks`);

        this.rocks.forEach(rock => {
            this.scene.remove(rock);
            // Dispose of geometry and materials to free memory
            if (rock.geometry) rock.geometry.dispose();
            if (rock.material) {
                if (Array.isArray(rock.material)) {
                    rock.material.forEach(mat => mat.dispose());
                } else {
                    rock.material.dispose();
                }
            }
        });

        this.rocks = [];
        this.environmentDetails = [];
    }

    /**
     * Replace the active scene definition. Used by Cycle 11 Phase 1 to keep
     * the same TerrainBuilder instance (and its models cache) across scene
     * swaps while updating per-scene fields like grass density, farmhouse
     * exclusion, and boundary kind.
     */
    setSceneDef(sceneDef) {
        this.sceneDef = sceneDef;
        this.farmHousePosition = sceneDef?.farmHouse?.position ?? this.farmHousePosition;
        if (sceneDef?.farmHouse?.exclusionArea) {
            this.farmHouseExclusionArea = sceneDef.farmHouse.exclusionArea;
        }
    }

    /**
     * Top-level scene-coupled teardown for in-process scene swap (Cycle 11
     * Phase 1). Composes existing partial-clears + adds the missing terrain
     * mesh / mountains / buildings disposal that no prior method covered.
     *
     * Re-usable across multiple swaps on the same instance. Preserves
     * `this.models` GLB cache (modelsLoaded stays true) — those are reusable
     * across scenes and re-fetching them on each swap blows the perf budget.
     */
    dispose() {
        try { this.clearTrees(); } catch (err) { console.warn('[TERRAIN] clearTrees threw:', err); }
        try { this.clearRocks(); } catch (err) { console.warn('[TERRAIN] clearRocks threw:', err); }

        if (this.grassSystem) {
            try { this.grassSystem.dispose(); } catch (err) { console.warn('[TERRAIN] grass dispose threw:', err); }
            this.grassSystem = null;
            this.grassMaterial = null;
            this.grassInstanceCount = 0;
        }

        // Mountains + buildings are cloned from this.models (GLB cache);
        // their geometries + materials are SHARED with the original. Disposing
        // would invalidate the cache and force re-upload on next clone (the
        // Phase 1 A8 texture-leak finding). Remove from scene only.
        if (this.mountains?.length) {
            this.mountains.forEach(m => {
                if (m.parent) m.parent.remove(m);
            });
            this.mountains = [];
        }

        if (this.buildings?.length) {
            this.buildings.forEach(b => {
                if (b.parent) b.parent.remove(b);
            });
            this.buildings = [];
        }

        if (this.terrainMesh) {
            if (this.terrainMesh.parent) this.terrainMesh.parent.remove(this.terrainMesh);
            this.terrainMesh.geometry?.dispose();
            if (this.terrainMesh.material) {
                if (Array.isArray(this.terrainMesh.material)) this.terrainMesh.material.forEach(m => m?.dispose?.());
                else this.terrainMesh.material.dispose();
            }
            this.terrainMesh = null;
        }

        this.environmentDetails = [];
        this.rockPositions = [];
        this.heightfield = null;
    }
}
