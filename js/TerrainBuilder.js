import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import { GrassSystem } from './GrassSystem.js';
import { loadKilnImpostor } from './kiln-impostor-material.js';
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
            // Cycle 16 Phase 1: LOD1 sibling GLBs (reduced canopy, used as
            // the mid-distance addLOD entry on the trunk + leaves
            // InstancedMesh2). Loaded alongside `trees` in loadModels;
            // createTrees pairs each LOD0 child mesh with its LOD1 sibling
            // by name (`trunk` / `leaves`).
            treesLod1: {},
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

        // Cycle 17 Phase 1: opt-in tree-creation diagnostics for the
        // mobile-probe harness. URL `?probeRender=1` flips this so
        // createTrees + _bakeTreeImpostor publish per-type bake outcomes
        // to `window.__sds.probe.trees`.
        this._probeRender = typeof window !== 'undefined'
            && new URLSearchParams(window.location?.search ?? '').get('probeRender') === '1';

        // Cycle 14 Phase 3: shared tree-wind uniforms. All tree-leaf
        // materials patched via _patchTreeWindMaterial reference these
        // (one set; per-frame update touches every patched material).
        // Direction matches grass for visual coherence; strength is its
        // own value because trees feel weight differently — leaves
        // shimmer at much lower amplitude than grass blades.
        this._treeWind = {
            uTime: { value: 0 },
            uWindStrength: { value: this.isMobile ? 0 : 0.6 },
            uWindDirection: { value: new THREE.Vector2(0.7, 0.7) }
        };
        // Set when each tree-type model is patched at load time. Per-tree-
        // type bbox bounds drive the leaf-vs-trunk weight in the shader.
        this._patchedTreeMaterials = new WeakSet();

        // Cycle 14 Phase 4: shared rock-rim uniforms. Per the rocks
        // dossier, fresnel rim-light is the single biggest "AAA tell"
        // for stylized rocks — silhouettes against grass pop without
        // changing geometry. Color is sun-tinted (set per-frame from
        // atmosphere.sun.light.color via setRockRimColor).
        this._rockShader = {
            uRimColor: { value: new THREE.Color(0xffe0b0) },
            uRimStrength: { value: 0.35 }
        };
        this._patchedRockMaterials = new WeakSet();
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
            // Cycle 14 Phase 3: trees baked from EZ-Tree v1.1.0 via
            // `npm run bake-trees` (tools/bake-trees.mjs). Stylized
            // cozy-game silhouettes with embedded leaf alpha at 256x256.
            // Re-bake whenever recipes change in tools/bake-trees.mjs.
            trees: [
                { name: 'tree1', path: 'assets/models/trees/tree1.glb' },
                { name: 'tree2', path: 'assets/models/trees/tree2.glb' }
            ],
            // Cycle 22 Phase A: meshopt-baked LOD1 (geometry-simplified, same
            // leaf count as LOD0). Re-enabled in createTrees with the LOD1
            // band at 80m. Cycle 16 leaf-count-halved version replaced.
            treesLod1: [
                { name: 'tree1', path: 'assets/models/trees/tree1_lod1.glb' },
                { name: 'tree2', path: 'assets/models/trees/tree2_lod1.glb' }
            ],
            // Cycle 14 Phase 4: rocks from Quaternius Stylized Nature
            // MegaKit (CC0). Rock_Medium_1/2/3 converted via gltf-transform
            // with 128px diffuse texture (distance-viewed; rim-light
            // shader supplies the silhouette pop).
            rocks: [
                { name: 'rock1', path: 'assets/models/rocks/rock1.glb' },
                { name: 'rock2', path: 'assets/models/rocks/rock2.glb' },
                { name: 'rock3', path: 'assets/models/rocks/rock3.glb' }
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
        // Cycle 14 floating-tree fix: ground reference uses ONLY the trunk
        // mesh's bbox. EZ-Tree presets sometimes droop leaves below the
        // trunk base — if those leaves drove modelBaseYOffset, the trunk
        // would float above terrain at scale (e.g. trunk 0.05m above
        // lowest-leaf × 15 scale → 0.75m hover). The bake script names
        // the trunk mesh 'trunk' (see tools/bake-trees/bake.html), so we
        // can pick it out reliably. Drooping leaves are then allowed to
        // sit at or below grass-blade level, which reads correctly.
        // modelBboxMinY/MaxY still reflect the full tree for the leaf-
        // wind shader's height normalization.
        for (const model of modelPaths.trees) {
            loadPromises.push(
                this.loader.loadAsync(model.path).then(gltf => {
                    const root = gltf.scene;
                    root.updateMatrixWorld(true);
                    let trunkMinY = Infinity;
                    let allMinY = Infinity;
                    let allMaxY = -Infinity;
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
                            if (child.name === 'trunk' && bb.min.y < trunkMinY) trunkMinY = bb.min.y;
                            if (bb.min.y < allMinY) allMinY = bb.min.y;
                            if (bb.max.y > allMaxY) allMaxY = bb.max.y;
                        }
                    });
                    if (!isFinite(allMinY)) { allMinY = 0; allMaxY = 1; }
                    const groundRef = isFinite(trunkMinY) ? trunkMinY : allMinY;
                    // Cycle 17 Phase 1: reset every node's local transform
                    // (root + intermediate Groups) after baking child world
                    // matrices into geometry. Otherwise gltf.scene's Group
                    // hierarchy retains its native scale (~0.021 for EZ-Tree
                    // GLBs), and any later `Box3.setFromObject(modelClone)` —
                    // which `_bakeTreeImpostor` does — re-applies that scale
                    // on top of the already-world-baked geometry, producing
                    // a ~30x undersized cross-billboard impostor (invisible
                    // at LOD2 distance). createTrees doesn't hit this because
                    // it consumes child.geometry directly.
                    root.traverse(node => {
                        node.position.set(0, 0, 0);
                        node.quaternion.identity();
                        node.scale.set(1, 1, 1);
                    });
                    root.updateMatrixWorld(true);
                    root.userData.modelBaseYOffset = -groundRef;
                    root.userData.modelBboxMinY = allMinY;
                    root.userData.modelBboxMaxY = allMaxY;
                    this.models.trees[model.name] = root;
                    console.log(`[OK] Loaded tree model: ${model.name} (trunk y_min=${groundRef.toFixed(3)}, bbox y=[${allMinY.toFixed(2)}, ${allMaxY.toFixed(2)}])`);
                }).catch(err => {
                    const errMsg = `tree/${model.name}: ${err.message || err}`;
                    console.error(`[ERROR] Failed to load ${errMsg}`);
                    loadErrors.push(errMsg);
                })
            );
        }

        // Cycle 16 Phase 1: load LOD1 sibling tree GLBs. Same world-matrix
        // baking as LOD0; the per-mesh geometry is what InstancedMesh2.addLOD
        // consumes. We don't need the modelBaseYOffset / bbox bookkeeping
        // here — the LOD0 model's offset already drives placement; the LOD1
        // child geometry just gets swapped in at distance > 80m.
        for (const model of modelPaths.treesLod1) {
            loadPromises.push(
                this.loader.loadAsync(model.path).then(gltf => {
                    const root = gltf.scene;
                    root.updateMatrixWorld(true);
                    root.traverse(child => {
                        if (!child.isMesh || !child.geometry) return;
                        child.geometry = child.geometry.clone();
                        child.geometry.applyMatrix4(child.matrixWorld);
                        child.position.set(0, 0, 0);
                        child.quaternion.identity();
                        child.scale.set(1, 1, 1);
                        child.updateMatrixWorld(true);
                    });
                    // Match LOD0: drop every node's local transform (root +
                    // intermediate Groups) so any Box3.setFromObject sees
                    // identity-rooted geometry.
                    root.traverse(node => {
                        node.position.set(0, 0, 0);
                        node.quaternion.identity();
                        node.scale.set(1, 1, 1);
                    });
                    root.updateMatrixWorld(true);
                    this.models.treesLod1[model.name] = root;
                    console.log(`[OK] Loaded tree LOD1 model: ${model.name}`);
                }).catch(err => {
                    // LOD1 missing is degraded-but-recoverable: createTrees
                    // falls back to LOD0-only when no sibling exists.
                    console.warn(`[WARN] Failed to load tree LOD1 ${model.name}: ${err.message || err} — falling back to LOD0-only chain`);
                })
            );
        }

        // Load rock models (non-critical). Cycle 14 Phase 4: same bake-
        // and-capture pattern as trees, plus a uniform height
        // normalization. Quaternius MegaKit rocks ship at "real-world"
        // ~2m native span, but the existing TerrainBuilder placement
        // scaleRange is 4–50 — designed for ~0.2m native unit assets.
        // Normalizing to a fixed native height (0.2m) means the existing
        // scale ranges produce 0.8–10m visible rocks (boulder range)
        // without tweaking the per-zone scaleRange tuples.
        const ROCK_NATIVE_HEIGHT = 0.2;
        for (const model of modelPaths.rocks) {
            loadPromises.push(
                this.loader.loadAsync(model.path).then(gltf => {
                    const root = gltf.scene;
                    root.updateMatrixWorld(true);
                    let minY = Infinity;
                    let maxY = -Infinity;
                    /** @type {THREE.BufferGeometry[]} */
                    const childGeos = [];
                    root.traverse(child => {
                        if (!child.isMesh || !child.geometry) return;
                        child.geometry = child.geometry.clone();
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
                        childGeos.push(child.geometry);
                    });
                    if (!isFinite(minY)) { minY = 0; maxY = 1; }
                    // Normalize to a fixed native height so the existing
                    // scaleRange tuples (4–50) produce reasonable visible
                    // sizes regardless of GLB authoring convention.
                    const nativeSpan = Math.max(maxY - minY, 1e-6);
                    const normFactor = ROCK_NATIVE_HEIGHT / nativeSpan;
                    for (const geo of childGeos) {
                        geo.scale(normFactor, normFactor, normFactor);
                        geo.computeBoundingBox();
                    }
                    minY *= normFactor;
                    maxY *= normFactor;
                    // Cycle 17 Phase 1: same root + intermediate-Group reset
                    // as trees, so Box3.setFromObject(rockModel) stays sane.
                    root.traverse(node => {
                        node.position.set(0, 0, 0);
                        node.quaternion.identity();
                        node.scale.set(1, 1, 1);
                    });
                    root.updateMatrixWorld(true);
                    root.userData.modelBaseYOffset = -minY;
                    root.userData.modelBboxMinY = minY;
                    root.userData.modelBboxMaxY = maxY;
                    this.models.rocks[model.name] = root;
                    console.log(`[OK] Loaded rock model: ${model.name} (native span ${nativeSpan.toFixed(2)}m → ${ROCK_NATIVE_HEIGHT}m, bbox y=[${minY.toFixed(2)}, ${maxY.toFixed(2)}])`);
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

        // Cycle 14 Phase 3: patch tree-leaf materials with the leaf-wind
        // shader. Done once at load — material refs are shared across scene
        // swaps via the GLB cache, so the patch survives.
        this._setupTreeWind();
        // Cycle 14 Phase 4: patch rock materials with fresnel rim-light.
        this._setupRockShader();

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
     * Cycle 14 Phase 3: patch a tree-leaf material with the shared leaf-wind
     * shader. Idempotent — re-patching a material is a no-op so successive
     * scene swaps don't compound. The shared `this._treeWind` uniform set
     * means a single per-frame update drives every patched material.
     *
     * Wind weight is `smoothstep(0.25, 1.0, posY01)²` where `posY01` is the
     * fraction up the tree from `modelBboxMinY` to `modelBboxMaxY`. Trunk
     * vertices (low Y) get weight ~0 and stay still; leaf vertices (high Y)
     * get weight 1 and sway fully. World-space wind math is applied AFTER
     * the instance Y-rotation by patching `<project_vertex>` so the wind
     * blows in the same world direction across every tree regardless of
     * its random spawn rotation.
     *
     * @param {THREE.Material} material
     * @param {number} bboxMinY GLB bbox min.y (object space, post-bake).
     * @param {number} bboxMaxY GLB bbox max.y.
     */
    _patchTreeWindMaterial(material, bboxMinY, bboxMaxY) {
        if (!material || this._patchedTreeMaterials.has(material)) return;
        this._patchedTreeMaterials.add(material);

        // Cycle 22 Phase B: alphaHash stochastic transparency. Kills the
        // hard alphaTest cutoff edge that snaps leaves on/off as alpha
        // ramps near the test threshold — the noise pattern dithers the
        // transition over a screen-space scale so LOD0/LOD1 swap and
        // distance fade read as smooth crossfades. alphaHash overrides
        // alphaTest when supported (Three r154+, shadow-fix r176). Three
        // r184 (this project's pinned version) ships both.
        if (material.transparent !== true) {
            material.alphaHash = true;
        }

        const uTime = this._treeWind.uTime;
        const uWindStrength = this._treeWind.uWindStrength;
        const uWindDirection = this._treeWind.uWindDirection;
        const uTreeBaseY = { value: bboxMinY };
        const uTreeTopY = { value: bboxMaxY };

        const prev = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
            if (typeof prev === 'function') prev(shader, renderer);
            shader.uniforms.uTime = uTime;
            shader.uniforms.uWindStrength = uWindStrength;
            shader.uniforms.uWindDirection = uWindDirection;
            shader.uniforms.uTreeBaseY = uTreeBaseY;
            shader.uniforms.uTreeTopY = uTreeTopY;

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    [
                        '#include <common>',
                        'uniform float uTime;',
                        'uniform float uWindStrength;',
                        'uniform vec2 uWindDirection;',
                        'uniform float uTreeBaseY;',
                        'uniform float uTreeTopY;'
                    ].join('\n')
                )
                .replace(
                    '#include <project_vertex>',
                    [
                        'vec4 mvPosition = vec4( transformed, 1.0 );',
                        '#ifdef USE_INSTANCING',
                        '  mvPosition = instanceMatrix * mvPosition;',
                        '#endif',
                        '{',
                        '  // Vertical fraction up the tree (0=base, 1=top).',
                        '  float treeRange = max(uTreeTopY - uTreeBaseY, 0.001);',
                        '  float posY01 = clamp((position.y - uTreeBaseY) / treeRange, 0.0, 1.0);',
                        '  float windWeight = smoothstep(0.25, 1.0, posY01);',
                        '  windWeight *= windWeight;',
                        '  if (windWeight > 0.001) {',
                        '    vec3 worldPos = (modelMatrix * mvPosition).xyz;',
                        '    vec2 perp = vec2(-uWindDirection.y, uWindDirection.x);',
                        '    vec2 windFlow = uWindDirection * uTime * 1.2;',
                        '    vec2 gustPos = worldPos.xz - windFlow;',
                        '    float gA = sin(gustPos.x * 0.04 + gustPos.y * 0.034);',
                        '    float gB = sin(gustPos.x * 0.018 + gustPos.y * 0.022 + 1.4);',
                        '    float gustEnv = smoothstep(-0.2, 1.0, gA * 0.6 + gB * 0.4);',
                        '    float sway1 = sin(worldPos.x * 0.15 + worldPos.z * 0.11 + uTime * 0.85);',
                        '    float sway2 = sin(worldPos.x * 0.07 - worldPos.z * 0.13 + uTime * 0.55);',
                        '    float sway = sway1 * 0.6 + sway2 * 0.4;',
                        '    float carrier = sway * (0.4 + gustEnv * 0.8);',
                        '    vec2 windDisp = uWindDirection * carrier * uWindStrength * 0.18 * windWeight;',
                        '    float flutter = sin(worldPos.x * 0.6 + worldPos.z * 0.5 + uTime * 4.5);',
                        '    windDisp += perp * flutter * 0.05 * windWeight * uWindStrength;',
                        '    // Apply in instance/world space (modelMatrix is identity for our tree InstancedMeshes).',
                        '    mvPosition.xz += windDisp;',
                        '  }',
                        '}',
                        'mvPosition = modelViewMatrix * mvPosition;',
                        'gl_Position = projectionMatrix * mvPosition;'
                    ].join('\n')
                );
        };
        // Force a recompile if the material has already been compiled.
        material.needsUpdate = true;
    }

    /**
     * Walk every tree-type GLB cached on `this.models.trees` and apply the
     * leaf-wind shader patch to each child material. Called once after
     * loadModels resolves; the WeakSet guard makes re-invocation a no-op.
     */
    _setupTreeWind() {
        for (const treeType of Object.keys(this.models.trees)) {
            const model = this.models.trees[treeType];
            if (!model) continue;
            const minY = model.userData?.modelBboxMinY ?? 0;
            const maxY = model.userData?.modelBboxMaxY ?? 1;
            model.traverse(child => {
                if (!child.isMesh || !child.material) return;
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => this._patchTreeWindMaterial(m, minY, maxY));
                } else {
                    this._patchTreeWindMaterial(child.material, minY, maxY);
                }
            });
        }
    }

    /**
     * Cycle 14 Phase 4: patch a rock material with a fresnel rim-light
     * shader. Per docs/research-rocks-and-scatter-2026-05.md, rim-light is
     * the single biggest "AAA tell" for stylized rocks — brightens the
     * silhouette against grass without changing geometry.
     *
     * Rim factor: `pow(1 - dot(viewDir, normal), 2)`. Tinted by
     * `uRimColor` (sun colour, updated per frame) at `uRimStrength`
     * intensity. Added to `totalEmissiveRadiance` so the contribution
     * lights up unlit shadow sides too — a stylized "sky bounce" cheat.
     *
     * Idempotent via `_patchedRockMaterials` WeakSet so re-invocation on
     * scene swap is a no-op.
     *
     * @param {THREE.Material} material
     */
    _patchRockMaterial(material) {
        if (!material || this._patchedRockMaterials.has(material)) return;
        this._patchedRockMaterials.add(material);

        const uRimColor = this._rockShader.uRimColor;
        const uRimStrength = this._rockShader.uRimStrength;

        const prev = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
            if (typeof prev === 'function') prev(shader, renderer);
            shader.uniforms.uRimColor = uRimColor;
            shader.uniforms.uRimStrength = uRimStrength;

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    [
                        '#include <common>',
                        'uniform vec3 uRimColor;',
                        'uniform float uRimStrength;'
                    ].join('\n')
                )
                .replace(
                    '#include <emissivemap_fragment>',
                    [
                        '#include <emissivemap_fragment>',
                        '{',
                        '  vec3 viewDir = normalize(vViewPosition);',
                        '  float ndv = max(dot(viewDir, normal), 0.0);',
                        '  float rockRim = pow(1.0 - ndv, 2.0);',
                        '  totalEmissiveRadiance += rockRim * uRimColor * uRimStrength;',
                        '}'
                    ].join('\n')
                );
        };
        material.needsUpdate = true;
    }

    /**
     * Walk every rock-type GLB and apply the rim-light patch. Called once
     * after loadModels resolves; the WeakSet guard makes re-invocation a
     * no-op across scene swaps.
     */
    _setupRockShader() {
        for (const rockType of Object.keys(this.models.rocks)) {
            const model = this.models.rocks[rockType];
            if (!model) continue;
            model.traverse(child => {
                if (!child.isMesh || !child.material) return;
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => this._patchRockMaterial(m));
                } else {
                    this._patchRockMaterial(child.material);
                }
            });
        }
    }

    /**
     * Update the shared rock-rim color from the atmosphere's sun light.
     * Called per-frame from main.js so rim hue tracks sunrise/sunset.
     * @param {THREE.Color} color
     */
    setRockRimColor(color) {
        if (!color || !this._rockShader) return;
        this._rockShader.uRimColor.value.copy(color);
    }

    /**
     * Cycle 17 follow-up (2026-05-04): tint cross-billboard tree impostors
     * by the current sun light color so they track time-of-day instead of
     * staying frozen at the bake's neutral lighting. Called per-frame from
     * main.js next to setRockRimColor; same source (atmosphere.sun.light.color)
     * so the whole scene agrees on the sun's hue at every tick.
     *
     * Tint formula: lerp neutral-white (1,1,1) TOWARD sun color at weight
     * `IMPOSTOR_TINT_BLEND`. Pure-multiply (mat.color.copy(sunColor)) was
     * darkening impostors noticeably under non-noon presets — dusk's
     * 0xff9a55 (RGB 1.0, 0.60, 0.33) drops green channel to 60% and blue
     * to 33%, making leaves look murky vs the in-scene MeshStandardMaterial
     * trees which also receive sky ambient. The lerp keeps impostor at
     * ~bake brightness while picking up enough sun hue to track sunrise
     * / sunset / overcast without losing parity against live trees.
     *
     * @param {THREE.Color} sunColor
     * @param {THREE.Vector3 | null} [sunDirWorld]
     * @param {THREE.Color | null} [ambientColor]
     * @param {number} [sunIntensity=1]      Pre-multiplied into uSunColor for kiln impostors
     * @param {number} [ambientIntensity=1]  Pre-multiplied into uAmbientColor for kiln impostors
     */
    /**
     * Cycle 21 Phase 2 (2026-05-04): bind the impostor calibration LUT
     * loaded from `assets/impostor-calibration-lut.json`. Called once at
     * scene init by main.js after fetch. The LUT's per-species boost
     * vector gets written into each kiln material's `uMatchBoost`
     * uniform when materials are created in createTrees(). Storing the
     * LUT reference (not the resolved values) means a hot-reload of the
     * LUT JSON during dev would re-apply on next scene load.
     *
     * @param {object} lut Parsed impostor-calibration-lut.json (v1
     *   schema: { version, boost: { species: [r,g,b] } }).
     */
    setImpostorCalibrationLUT(lut) {
        this._impostorMatchLUT = lut;
        // If kiln materials are already alive (LUT loaded after createTrees
        // ran), retroactively apply. Phase 2 v1: createTrees runs after
        // main.js's await fetch, so this branch is unused, but it's cheap
        // insurance against future load-order changes.
        if (this._impostorMaterials && lut?.boost) {
            for (const mat of this._impostorMaterials) {
                if (!mat.userData?.isKilnImpostor) continue;
                const species = mat.userData?.species;
                const boost = species ? lut.boost[species] : null;
                if (boost && mat.uniforms.uMatchBoost) {
                    mat.uniforms.uMatchBoost.value.set(
                        boost[0] ?? 1, boost[1] ?? 1, boost[2] ?? 1,
                    );
                }
            }
        }
    }

    setImpostorTint(sunColor, sunDirWorld = null, ambientColor = null, sunIntensity = 1, ambientIntensity = 1) {
        if (!sunColor || !this._impostorMaterials) return;

        // Cycle 20 Phase 2: split materials by impostor kind. Kiln impostors
        // run proper per-fragment relighting — they consume sunColor +
        // sunDirWorld + ambientColor and need no pre-multiplied tint hack.
        // Cross-billboard fallback (Cycle 16/17 impostor or any
        // MeshBasicMaterial) keeps the Cycle 19 sun-luma boost since they
        // can't relight on their own.
        const BLEND = 0.35;
        const tmp = new THREE.Color(0xffffff).lerp(sunColor, BLEND);
        const lum = 0.299 * sunColor.r + 0.587 * sunColor.g + 0.114 * sunColor.b;
        const boost = 1.0 + 0.20 * Math.max(0, Math.min(1, lum));
        tmp.multiplyScalar(boost);

        // Cycle 20 Phase 2 v3 (2026-05-04): pre-multiply by light intensity
        // ONLY — the kiln fragment shader now divides by RECIPROCAL_PI to
        // match Three's BRDF_Lambert exactly, so the v2 SUN_BOOST/AMB_BOOST
        // fudge factors are gone. uSunColor + uAmbientColor here are
        // byte-identical to what Three's WebGLLights writes into its
        // directionalLights[i].color and ambientLightColor uniforms — so
        // the impostor's diffuse-direct + diffuse-indirect math produces
        // the same magnitude as MeshLambertMaterial / MeshStandardMaterial
        // would on the same surface.

        // Cycle 20 v4 (2026-05-04): also drive the ground-bounce hemi term.
        // Foliage research recipe (Megascans / IceFall / NedMakesGames URP):
        // shadow side of canopy must pick up SOME chromatic bounce, not
        // flat-grey ambient, or impostor reads desaturated vs LOD0. We
        // synthesize the bounce color by tilting the current ambient toward
        // a warm earth tone — half-strength of the sky-side fill so it
        // doesn't wash out the directional shading.
        const GROUND_BOUNCE_TILT = new THREE.Color(0.85, 0.70, 0.55);  // warm-earth
        const GROUND_BOUNCE_SCALE = 0.5;

        for (const mat of this._impostorMaterials) {
            if (mat.userData?.isKilnImpostor) {
                mat.uniforms.uSunColor.value
                    .copy(sunColor)
                    .multiplyScalar(sunIntensity);
                if (sunDirWorld) mat.uniforms.uSunDirWorld.value.copy(sunDirWorld);
                if (ambientColor) {
                    mat.uniforms.uAmbientColor.value
                        .copy(ambientColor)
                        .multiplyScalar(ambientIntensity);
                    // Ground bounce = ambient × earth-tilt × scale.
                    mat.uniforms.uGroundBounceColor.value
                        .copy(ambientColor)
                        .multiply(GROUND_BOUNCE_TILT)
                        .multiplyScalar(ambientIntensity * GROUND_BOUNCE_SCALE);
                } else {
                    // Default ambient when atmosphere hasn't bound yet — use
                    // Three's physical-light convention (color × π).
                    const fallback = 0.7 * Math.PI;
                    mat.uniforms.uAmbientColor.value.setRGB(fallback, fallback, fallback);
                    mat.uniforms.uGroundBounceColor.value.setRGB(
                        fallback * GROUND_BOUNCE_TILT.r * GROUND_BOUNCE_SCALE,
                        fallback * GROUND_BOUNCE_TILT.g * GROUND_BOUNCE_SCALE,
                        fallback * GROUND_BOUNCE_TILT.b * GROUND_BOUNCE_SCALE,
                    );
                }
            } else if (mat.color) {
                // Cross-billboard fallback path.
                mat.color.copy(tmp);
            }
        }

        // Cycle 20 v4 debug tap: surface the latest input + first impostor
        // material's uniforms via window so the LOD-color-match sandbox /
        // playwright_evaluate can introspect the live values without
        // reaching into the renderer/scene graph.
        if (typeof window !== 'undefined') {
            const firstKiln = this._impostorMaterials.find(m => m.userData?.isKilnImpostor);
            window.__sdsImpostorProbe = {
                input: {
                    sunColor: sunColor ? sunColor.toArray() : null,
                    sunIntensity,
                    sunDirWorld: sunDirWorld ? sunDirWorld.toArray() : null,
                    ambientColor: ambientColor ? ambientColor.toArray() : null,
                    ambientIntensity,
                },
                live: firstKiln ? {
                    uSunColor: firstKiln.uniforms.uSunColor.value.toArray(),
                    uAmbientColor: firstKiln.uniforms.uAmbientColor.value.toArray(),
                    uGroundBounceColor: firstKiln.uniforms.uGroundBounceColor.value.toArray(),
                    uSunDirWorld: firstKiln.uniforms.uSunDirWorld.value.toArray(),
                    uWrapPow: firstKiln.uniforms.uWrapPow.value,
                    uSubsurfaceLift: firstKiln.uniforms.uSubsurfaceLift.value,
                } : null,
                count: this._impostorMaterials.filter(m => m.userData?.isKilnImpostor).length,
                // Cycle 20 v5: expose scene + first kiln material so the
                // tools/lod-color-match.html (and ad-hoc playwright probes)
                // can sample live LOD0 vs impostor pixels under the
                // current atmosphere — replaces the synthetic sandbox.
                scene: this.scene,
                trees: this.trees,
                kilnMaterial: firstKiln,
            };
        }
    }

    /**
     * Terrain-mesh-accurate ground height for entity placement.
     *
     * Visible ground Y at (x, z) — triangle-interpolates against the captured
     * terrain-mesh vertex grid. Cycle 14 Phase 1: this used to mirror the
     * radial falloff in JS to compensate for `heightfield.sample()` clamping
     * past `worldSize`. The mesh-grid path now carries the exact same falloff
     * already (it's baked into the captured displacedHeights), so the JS
     * mirror is gone and we just delegate.
     */
    _groundY(x, z) {
        if (!this.heightfield) return 0;
        return this.heightfield.meshSampleY(x, z);
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
            // Capture post-displacement Ys into a (segs+1)² grid so visual
            // consumers (grass, trees, rocks, sheep, dog) can triangle-
            // interpolate against exactly the geometry the renderer draws.
            // PlaneGeometry vertex order: ix walks east (+X), iy walks south
            // (+Z after rotation), index = iy * (segs+1) + ix.
            const stride = terrainSegments + 1;
            const displacedHeights = new Float32Array(stride * stride);
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
                const y = h * falloff;
                positions.setZ(i, y);
                displacedHeights[i] = y;
            }
            positions.needsUpdate = true;
            terrainGeometry.computeVertexNormals();
            this.heightfield.setMeshGrid({
                displacedHeights,
                segments: terrainSegments,
                size: terrainSize
            });
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

    // Cycle 19 follow-up (2026-05-04): the Cycle 14 Phase 4 ScatterSystem
    // (pebbles + mushrooms + clovers + flowers — the "alive meadow" detail
    // layer) was removed. The sub-metre props were too small to read at
    // gameplay camera distances and contributed enough draw cost to be
    // visible in PERF without a corresponding visual payoff. Grass already
    // sells the meadow feel; trees + rocks + the heightfield carry the
    // landscape silhouette.

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

        // Cycle 16 Phase 1+2: per-instance LOD chain via InstancedMesh2.addLOD.
        // Each tree GLB has trunk + leaves child meshes; each gets its own
        // InstancedMesh2 with up to a 3-tier chain:
        //   LOD0 (mesh)      — full baked geometry, near distance.
        //   LOD1 (reduced)   — sibling LOD1 GLB's matching child geometry,
        //                      swap at 80m.
        //   LOD2 (impostor)  — leaves swap to cross-billboard atlas at 150m;
        //                      trunk swaps to a degenerate 3-vert geometry
        //                      (the cross-billboard texture already shows
        //                      the trunk silhouette; rendering the LOD1
        //                      trunk on top of it would z-fight + alpha-bleed).
        //
        // Replaces the Cycle 14 world-distance-from-origin split (FAR_LOD_DIST
        // 400m) with a per-instance per-frame camera-distance test. Net win:
        // one camera position no longer freezes "far = billboard" for the
        // entire scene's lifetime; the chase camera moving toward a tree now
        // smoothly upgrades it through LOD2 → LOD1 → LOD0 with hysteresis.
        const renderer = getSceneManager()?.getRenderer();
        const instancedMeshes = [];

        // Cycle 17 follow-up: reset the per-swap impostor-material list so
        // setImpostorTint() doesn't hold stale refs from the prior scene's
        // billboards (which are removed from scene + may be disposed in
        // clearTrees depending on their sharedFromGlbCache flag).
        this._impostorMaterials = [];

        // Cycle 17 Phase 1: probe hook (gated on `?probeRender=1`). Captures
        // renderer-truthy + per-type bake outcome + final LOD chain so the
        // mobile-probe harness can diagnose invisible-trees-at-distance
        // without DevTools. No cost when the param isn't set.
        const probe = this._probeRender ? (window.__sds = window.__sds || {}, window.__sds.probe = window.__sds.probe || { trees: {} }) : null;
        if (probe) {
            probe.trees.rendererAtCreate = !!renderer;
            probe.trees.isMobile = !!this.isMobile;
            probe.trees.byType = {};
        }

        // Cache baked cross-billboard impostors per tree type — survives
        // dispose() like the models cache. Cycle 11 Phase 1 A8 finding:
        // re-baking on each scene swap leaks one WebGLRenderTarget per
        // tree species per swap (~5 GL textures per cycle).
        if (!this._bakeImpostorCache) this._bakeImpostorCache = new Map();

        // Cycle 19 follow-up (2026-05-04): build the trunk's LOD2 empty
        // geometry by cloning the trunk's own attribute schema with zero-
        // length buffers. The previous shared 3-vert empty triggered ANGLE
        // "Vertex buffer is not big enough for the draw call" warnings
        // when the active trunk material expected attributes (e.g. tangent)
        // not provided by the shared empty. Cloning per-trunk-type ensures
        // every attribute the trunk's vertex shader binds resolves to a
        // real (zero-length) buffer.
        const makeMatchingEmptyGeo = (srcGeo) => {
            const empty = new THREE.BufferGeometry();
            for (const [name, attr] of Object.entries(srcGeo.attributes)) {
                const TypedArray = attr.array.constructor;
                empty.setAttribute(name, new THREE.BufferAttribute(new TypedArray(0), attr.itemSize));
            }
            if (srcGeo.index) {
                const TypedArray = srcGeo.index.array.constructor;
                empty.setIndex(new THREE.BufferAttribute(new TypedArray(0), 1));
            }
            empty.boundingBox = new THREE.Box3();
            empty.boundingSphere = new THREE.Sphere();
            return empty;
        };
        if (!this._lod2EmptyGeoCache) this._lod2EmptyGeoCache = new WeakMap();

        // Cycle 20 Phase 2: pre-load offline-baked Kiln impostors in parallel
        // for every tree type that's actually about to be instanced. The
        // loader caches by URL across scene swaps, so the cost is paid once
        // per session per species. Concurrent fetch + decode hides under
        // the existing tree-instance build (see Promise.all join below).
        const kilnImpostorByType = new Map();
        const kilnTreeTypes = Object.entries(treeInstances)
            .filter(([type, list]) => list.length > 0 && this.models.trees[type])
            .map(([type]) => type);
        const kilnLoadResults = await Promise.all(
            kilnTreeTypes.map((type) => loadKilnImpostor(`assets/models/trees/${type}.imposter`))
        );
        for (let i = 0; i < kilnTreeTypes.length; i++) {
            const triple = kilnLoadResults[i];
            if (!triple) continue;
            kilnImpostorByType.set(kilnTreeTypes[i], triple);
            // Tag the material with its species so setImpostorCalibrationLUT
            // can retroactively apply boost on hot-LUT reload.
            if (triple.material?.userData) {
                triple.material.userData.species = kilnTreeTypes[i];
            }
            // Cycle 21 Phase 2 (2026-05-04): apply per-species calibration
            // boost from impostor-calibration-lut.json. Set once at material
            // creation — no per-frame update needed since the boost is
            // sampling/bake-property correction, not lighting state. Defaults
            // to (1,1,1) when LUT is missing or species absent.
            const boost = this._impostorMatchLUT?.boost?.[kilnTreeTypes[i]];
            if (boost && triple.material?.uniforms?.uMatchBoost) {
                triple.material.uniforms.uMatchBoost.value.set(
                    boost[0] ?? 1, boost[1] ?? 1, boost[2] ?? 1,
                );
            }
        }

        Object.entries(treeInstances).forEach(([treeType, instances]) => {
            if (instances.length === 0 || !this.models.trees[treeType]) return;

            const lod0Model = this.models.trees[treeType];
            const lod1Model = this.models.treesLod1?.[treeType] ?? null;

            // Index LOD0 + LOD1 children by mesh name so trunk pairs with
            // trunk and leaves with leaves. The bake script names them
            // 'trunk' and 'leaves'; older / hand-edited GLBs may not, in
            // which case the LOD1 lookup falls back to "no LOD1 sibling
            // for this child" → LOD chain degrades to LOD0→LOD2 only.
            const lod1ChildByName = new Map();
            if (lod1Model) {
                lod1Model.traverse(c => { if (c.isMesh && c.geometry) lod1ChildByName.set(c.name, c); });
            }

            // Cycle 20 Phase 2: prefer the offline-baked Kiln impostor (loaded
            // above into kilnImpostorByType). Fall back to the Cycle 16/17
            // cross-billboard if the kiln load failed — Pixel Forge bakes
            // are committed bytes, so the only realistic failure modes are
            // missing files (re-bake required) or a malformed sidecar
            // (`tests/imposter-sidecar.spec.js` should have caught it).
            const kiln = kilnImpostorByType.get(treeType) ?? null;

            // Cross-billboard fallback (also the cached path for headless
            // probes / kiln-load failure).
            let impostor = kiln ? null : this._bakeImpostorCache.get(treeType);
            const impostorWasCached = !!impostor;
            if (!kiln && !impostor && renderer) {
                impostor = this._bakeTreeImpostor(lod0Model, renderer);
                if (impostor) this._bakeImpostorCache.set(treeType, impostor);
            }
            if (probe) {
                probe.trees.byType[treeType] = {
                    instances: instances.length,
                    lod1Available: !!lod1Model,
                    impostorBaked: !!(kiln || impostor),
                    impostorFromCache: !!kiln || impostorWasCached,
                    impostorKind: kiln ? 'kiln' : impostor ? 'cross-billboard' : 'none',
                    impostorWidth: kiln
                        ? +(kiln.sidecar.worldSize).toFixed(3)
                        : impostor ? +impostor.width.toFixed(3) : null,
                    impostorBboxMinY: kiln
                        ? +(kiln.sidecar.bbox.min[1]).toFixed(3)
                        : impostor ? +impostor.bboxMinY.toFixed(3) : null,
                    impostorBboxMaxY: kiln
                        ? +(kiln.sidecar.bbox.max[1]).toFixed(3)
                        : impostor ? +impostor.bboxMaxY.toFixed(3) : null,
                    bakeBox: probe.trees.lastBakeBox ? { ...probe.trees.lastBakeBox } : null,
                    rendererAvailable: !!renderer,
                };
            }

            let billboardGeo = null;
            let billboardMat = null;
            if (kiln) {
                // Cycle 20 Phase 2 primary path. Geometry + material were
                // built once by loadKilnImpostor and cached — reuse the
                // exact instances across all tree-children of this type
                // (only the leaves child takes the impostor LOD; trunk
                // children get the empty geometry below).
                billboardGeo = kiln.geometry;
                billboardMat = kiln.material;
            } else if (impostor) {
                // Cross-billboard fallback (Cycle 16/17).
                // `transparent: false` puts the billboard in the OPAQUE
                // render queue with a hard alpha cutoff. The transparent
                // queue's alpha-blend interaction with mipmapped silhouettes
                // produced a light halo around tree edges at distance.
                billboardGeo = this._createCrossBillboardGeometry(impostor.width, impostor.bboxMinY, impostor.bboxMaxY);
                billboardMat = new THREE.MeshBasicMaterial({
                    map: impostor.texture,
                    transparent: false,
                    alphaTest: 0.4,
                    side: THREE.DoubleSide,
                    depthWrite: true,
                    fog: true
                });
            }
            if (billboardMat) {
                // Tracked on `this._impostorMaterials` so the per-frame
                // setImpostorTint() can update each material's color to
                // follow sun direction + time-of-day.
                if (!this._impostorMaterials) this._impostorMaterials = [];
                this._impostorMaterials.push(billboardMat);
            }

            lod0Model.traverse(child => {
                if (!child.isMesh || !child.geometry) return;

                const isLeavesMesh = child.name === 'leaves';
                const lod1Child = lod1ChildByName.get(child.name);

                const im = new InstancedMesh2(
                    child.geometry,
                    child.material,
                    { capacity: instances.length, createEntities: false }
                );
                // Cycle 12 Phase 1 A8: this InstancedMesh shares its
                // geometry + material with the cached GLB model. Tag so
                // clearTrees() removes-from-scene only — disposing would
                // invalidate the GLB cache and force a texture re-upload
                // on the next swap (the dominant ~41% drift class).
                im.userData.sharedFromGlbCache = true;

                // Cycle 22 Phase A (2026-05-05): LOD1 80m band re-enabled
                // with meshopt-baked geometry (same leaf count as LOD0; ~38%
                // tree1 / ~45% tree2 vert reduction). Replaces the Cycle 16
                // leaf-count-halved LOD1 that produced the Cycle 17 visual
                // rejection. LOD chain:
                //   LOD0 (full geo)  0-80m
                //   LOD1 (meshopt)   80-200m
                //   LOD2 (impostor)  200m+ for leaves; trunk → empty quad
                //
                // LOD1 attaches per matching child mesh name (trunk paired
                // with trunk, leaves with leaves). lod1Child may be null
                // for unmatched children — fall back to LOD0-only band
                // until impostor takeover.
                if (lod1Child?.geometry && lod1Child?.material) {
                    im.addLOD(lod1Child.geometry, lod1Child.material, 80);
                }

                if (billboardGeo && billboardMat) {
                    if (isLeavesMesh) {
                        // Cycle 21 Phase 5 (2026-05-05): pushed LOD swap
                        // 100m → 200m. Foreground/midground stays geometric
                        // (LOD0) where the camera spends most time; impostors
                        // only fill the deepest fog band where atmospheric
                        // perspective is doing most of the visual work.
                        im.addLOD(billboardGeo, billboardMat, 200);
                        // Cycle 21 Phase 5 fix: explicitly route the SHADOW
                        // render pass through LOD0 ONLY — never through the
                        // LOD2 impostor billboard. Default behaviour falls
                        // back to LODinfo.render when shadowRender is null
                        // (see @three.ez/instanced-mesh FrustumCulling.js
                        // line 20: `LODinfo.shadowRender ?? LODinfo.render`),
                        // which routes the impostor billboard quad into
                        // shadow rendering. The billboard vertex shader uses
                        // `cameraPosition` for camera-facing pose; during
                        // the shadow pass `cameraPosition` is the LIGHT's
                        // position, so the billboard ends up facing the sun
                        // and its shadow on the ground doesn't align with
                        // the player camera's view of the tree — visible as
                        // a "detached film" beside each distant tree (Matt
                        // 2026-05-05 review). Setting shadowRender to a
                        // single-level chain pinned to LOD0 (`im` itself,
                        // distance 0) means every instance renders LOD0
                        // geometry into the shadow map regardless of
                        // camera-LOD pick → leaf-shaped shadow that
                        // matches the player's view of the canopy. Slight
                        // perf cost (shadow pass renders LOD0 for all
                        // instances) but shadow rendering is depth-only +
                        // no fragment shader, so it's negligible at our
                        // 200-500-tree scale.
                        im.LODinfo.shadowRender = {
                            levels: [{ distance: 0, hysteresis: 0, object: im }],
                            count: [0],
                        };
                    } else {
                        let trunkLod2 = this._lod2EmptyGeoCache.get(child.geometry);
                        if (!trunkLod2) {
                            trunkLod2 = makeMatchingEmptyGeo(child.geometry);
                            this._lod2EmptyGeoCache.set(child.geometry, trunkLod2);
                        }
                        // Cycle 21 Phase 5: same 200m distance as leaves.
                        im.addLOD(trunkLod2, child.material, 200);
                    }
                }

                // InstancedMesh2 entities expose position/quaternion/scale
                // (no Euler `rotation`). Convert from the placement record's
                // THREE.Euler via the shared scratch.
                im.addInstances(instances.length, (obj, i) => {
                    const inst = instances[i];
                    obj.position.copy(inst.position);
                    obj.quaternion.setFromEuler(inst.rotation);
                    obj.scale.copy(inst.scale);
                });

                // Cycle 19 follow-up (2026-05-04): build a BVH so per-instance
                // frustum culling + LOD distance checks short-circuit by tree-
                // chunk instead of scanning every instance. Trees are static
                // post-placement (no per-frame matrix updates), so margin: 0
                // is fine — the BVH stays valid for the lifetime of the swap.
                im.computeBVH({ margin: 0 });

                im.castShadow = !this.isMobile;
                im.receiveShadow = true;

                this.scene.add(im);
                instancedMeshes.push(im);
            });

            const lodTag = billboardGeo ? 'LOD0+impostor' : 'LOD0-only';
            console.log(`[TERRAIN] Created ${instances.length} ${treeType} mesh instances (${lodTag})`);
        });

        this.trees = instancedMeshes;
        const total = Object.values(treeInstances).reduce((s, a) => s + a.length, 0);
        console.log(`[TERRAIN] Total trees: ${total} (per-instance LOD0/LOD1/LOD2 chain)`);

        return instancedMeshes;
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
        // Cycle 17 Phase 2: dropped ambient 0.55 → 0.30 + dirLight 0.85 → 0.55
        // (combined 0.85× vs prior 1.40×). Prior values washed brown bark
        // (e.g. 0x6e4f30 = RGB 0.43/0.31/0.19) up to RGB ~0.60/0.43/0.27 —
        // a tan/cream tone that read as a "white bark" silhouette against
        // grass at LOD2 distance. New values keep brown brown.
        const ambient = new THREE.AmbientLight(0xffffff, 0.30);
        bakeScene.add(ambient);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
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
        // Cycle 17 Phase 1 probe: capture pre-camera bbox size so the
        // mobile-probe harness can detect zero-width bake regressions.
        if (this._probeRender && typeof window !== 'undefined') {
            window.__sds = window.__sds || {};
            window.__sds.probe = window.__sds.probe || { trees: {} };
            window.__sds.probe.lastBakeBox = { x: size.x, y: size.y, z: size.z, minY: box.min.y, maxY: box.max.y };
        }

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

    // Cycle 20 Phase 2 — `_bakeOctahedralImpostor()` removed. The runtime
    // atlas baker (Cycle 18 Phase 3) is replaced by the offline Pixel Forge
    // / Kiln pipeline. Build path:
    //   `npm run bake-tree-impostors` → assets/models/trees/<name>.imposter.{png,normal.png,depth.png,json}
    //   js/kiln-impostor-material.js  ← runtime material; loadKilnImpostor() consumes the sidecar
    // See cycle20-validation/phase0/AUDIT.md for the migration rationale.

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
                    // sinks below the ground plane. Cycle 14 Phase 4:
                    // compensate for the GLB's pivot via modelBaseYOffset
                    // (Quaternius rocks pivot at centroid, not base — without
                    // the lift they'd float by ~half their height). The lift
                    // is multiplied by the Y-scale factor (0.7 below) so the
                    // lowest visible vertex lands exactly on terrain Y. Bury
                    // is in world units so it feels consistent across the
                    // scale variance.
                    const ROCK_Y_SCALE = 0.7;
                    const baseY = this._groundY(rock.x, rock.z);
                    const baseOffset = this.models.rocks[rockType]?.userData?.modelBaseYOffset ?? 0;
                    const yOffset = baseY + baseOffset * finalScale * ROCK_Y_SCALE - finalScale * (0.03 + Math.random() * 0.03);

                    rockInstances[rockType].push({
                        position: new THREE.Vector3(rock.x, yOffset, rock.z),
                        rotation: new THREE.Euler(
                            Math.random() * Math.PI * 0.3,
                            Math.random() * Math.PI * 2,
                            Math.random() * Math.PI * 0.3
                        ),
                        scale: new THREE.Vector3(finalScale, finalScale * ROCK_Y_SCALE, finalScale * 1.2)
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
        
        // Create instanced meshes for each rock type.
        //
        // Cycle 19 follow-up (2026-05-04): migrated from THREE.InstancedMesh
        // → InstancedMesh2 (@three.ez/instanced-mesh) so we get per-instance
        // CPU frustum culling (the plain InstancedMesh tests only the *whole-
        // mesh* AABB against the frustum — with rocks scattered across a
        // 1.5km² map the AABB always covers the camera, so every instance
        // gets submitted regardless of view direction). InstancedMesh2's
        // `perObjectFrustumCulled` defaults to true; `computeBVH()` after
        // `addInstances` accelerates that linear scan.
        const instancedMeshes = [];

        Object.entries(rockInstances).forEach(([rockType, instances]) => {
            if (instances.length === 0 || !this.models.rocks[rockType]) return;

            const model = this.models.rocks[rockType];

            // Get all meshes from the model
            model.traverse(child => {
                if (child.isMesh) {
                    const instancedMesh = new InstancedMesh2(
                        child.geometry,
                        child.material,
                        { capacity: instances.length, createEntities: false }
                    );
                    // Cycle 12 Phase 1 A8: shared with the cached GLB. Tag so
                    // clearRocks() does not dispose — see clearTrees comment.
                    instancedMesh.userData.sharedFromGlbCache = true;

                    instancedMesh.addInstances(instances.length, (obj, i) => {
                        const inst = instances[i];
                        obj.position.copy(inst.position);
                        obj.quaternion.setFromEuler(inst.rotation);
                        obj.scale.copy(inst.scale);
                    });

                    // Build the BVH that accelerates per-instance culling.
                    // Rocks are static (no per-frame position updates), so
                    // the BVH never needs to rebuild — pass margin: 0.
                    // `getBBoxFromBSphere` is a faster bbox approximation
                    // when geometry is centered; rock GLBs aren't strictly
                    // origin-centered (Quaternius pivots are at the
                    // centroid) so we leave it false to use a precise bbox.
                    instancedMesh.computeBVH({ margin: 0 });

                    // Disable rock shadows on mobile
                    instancedMesh.castShadow = !this.isMobile;
                    instancedMesh.receiveShadow = true;

                    this.scene.add(instancedMesh);
                    instancedMeshes.push(instancedMesh);
                }
            });

            console.log(`[BUILD] Created ${instances.length} ${rockType} instances (InstancedMesh2 + BVH)`);
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

        // Cycle 14 Phase 3: drive the shared tree-wind uniforms. Mirror the
        // grass system's wind direction so trees and grass agree on which
        // way the wind is blowing per scene.
        if (this._treeWind) {
            this._treeWind.uTime.value = performance.now() * 0.001;
            const grassWind = this.grassSystem?.grassMaterial?.uniforms?.windDirection?.value;
            if (grassWind) {
                this._treeWind.uWindDirection.value.copy(grassWind);
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
            // Cycle 12 Phase 1 A8: near-tree InstancedMeshes share their
            // geometry + material with the cached GLB models. Disposing them
            // invalidates the cache and forces a full texture re-upload on
            // the next swap (the dominant leak class behind the ~41% texture
            // drift). Far billboards (cross-quad impostors) DO own their
            // MeshBasicMaterial — that's per-swap allocated. Their `.map`
            // points at the cached impostor texture which must NOT be
            // disposed (cleared explicitly below).
            if (tree.userData?.sharedFromGlbCache) return;
            if (tree.geometry) tree.geometry.dispose();
            if (tree.material) {
                if (Array.isArray(tree.material)) {
                    tree.material.forEach(mat => {
                        if (mat) {
                            mat.map = null;
                            mat.dispose();
                        }
                    });
                } else {
                    tree.material.map = null;
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

        // Clear existing trees + rocks
        this.clearTrees();
        this.clearRocks();

        // Regenerate grass with new exclusion zones
        await this.regenerateGrass(bounds, pasture);

        // Rebuild trees + rocks with new exclusion zones
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
            // Cycle 12 Phase 1 A8: rock InstancedMeshes share their geometry +
            // material with the cached GLB. See clearTrees() for the full
            // explanation of the GLB-shared-material trap.
            if (rock.userData?.sharedFromGlbCache) return;
            if (rock.geometry) rock.geometry.dispose();
            if (rock.material) {
                if (Array.isArray(rock.material)) {
                    rock.material.forEach(mat => mat?.dispose?.());
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
