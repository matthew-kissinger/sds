import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';
import { loadKilnImpostor } from './kiln-impostor-material.js';
import { getOccluderUniforms, patchMaterialOccluder } from './shaders/OccluderFadePatch.js';
import { log as probeLog } from './diagnostics/glProbe.js';
import { getSceneManager } from './GameBridge.js';
import { TIER_PRESETS } from './HardwareTier.js';

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
import { placeEnvironmentDetails } from './world/RockPlacement.js';
import { placeTrees, bakeTreeImpostor, createCrossBillboardGeometry } from './world/TreePlacement.js';
import {
    patchTreeWindMaterial as runPatchTreeWind,
    setupTreeWind as runSetupTreeWind,
    patchRockMaterial as runPatchRock,
    setupRockShader as runSetupRockShader,
    setRockRimColor as runSetRockRimColor,
    setImpostorTint as runSetImpostorTint
} from './world/shaderPatches.js';
import {
    setDynamicBounds as runSetDynamicBounds,
    updateFarmhousePosition as runUpdateFarmhousePosition,
    rebuildEnvironment as runRebuildEnvironment,
    regenerateGrass as runRegenerateGrass
} from './world/sandbox.js';
import { createKonveyorTerrainMaterial } from './world/konveyorTerrainMaterialAdapter.js';
import { shouldApplyKonveyorRendererFlag } from './rendering/konveyorRuntimeMode.js';

function createKonveyorTerrainHeightTexture(heightfield) {
    const texture = new THREE.DataTexture(
        heightfield.getRawArray(),
        heightfield.width,
        heightfield.height,
        THREE.RedFormat,
        THREE.FloatType,
    );
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
}

function createTerrainSkirtGeometry(outerSize, innerSize, heightfield = null) {
    const outer = outerSize * 0.5;
    const inner = innerSize * 0.5;
    const radialSegments = 8;
    const edgeSegments = 48;
    const positions = [];
    const uvs = [];
    const indices = [];

    const sampleSkirtHeight = (localX, localY, radialT) => {
        if (!heightfield) return 0;
        const worldZ = -localY;
        const fade = (1 - radialT) * (1 - radialT);
        const sample = heightfield.meshSampleY?.(localX, worldZ)
            ?? heightfield.sample?.(localX, worldZ)
            ?? 0;
        return sample * fade;
    };
    const pushVertex = (localX, localY, radialT) => {
        positions.push(localX, localY, sampleSkirtHeight(localX, localY, radialT));
        uvs.push((localX + outer) / outerSize, (localY + outer) / outerSize);
    };
    const addStrip = (coordAt) => {
        const base = positions.length / 3;
        for (let r = 0; r <= radialSegments; r++) {
            const radialT = r / radialSegments;
            for (let e = 0; e <= edgeSegments; e++) {
                const edgeT = e / edgeSegments;
                const { x, y } = coordAt(edgeT, radialT);
                pushVertex(x, y, radialT);
            }
        }
        const stride = edgeSegments + 1;
        for (let r = 0; r < radialSegments; r++) {
            for (let e = 0; e < edgeSegments; e++) {
                const i = base + r * stride + e;
                indices.push(i, i + 1, i + stride + 1, i, i + stride + 1, i + stride);
            }
        }
    };

    addStrip((edgeT, radialT) => ({
        x: THREE.MathUtils.lerp(-outer, outer, edgeT),
        y: THREE.MathUtils.lerp(-inner, -outer, radialT),
    }));
    addStrip((edgeT, radialT) => ({
        x: THREE.MathUtils.lerp(-outer, outer, edgeT),
        y: THREE.MathUtils.lerp(inner, outer, radialT),
    }));
    addStrip((edgeT, radialT) => ({
        x: THREE.MathUtils.lerp(-inner, -outer, radialT),
        y: THREE.MathUtils.lerp(-inner, inner, edgeT),
    }));
    addStrip((edgeT, radialT) => ({
        x: THREE.MathUtils.lerp(inner, outer, radialT),
        y: THREE.MathUtils.lerp(-inner, inner, edgeT),
    }));

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.userData.terrainSkirtSize = outerSize;
    geometry.userData.terrainSkirtInnerSize = innerSize;
    geometry.userData.terrainSkirtRadialSegments = radialSegments;
    geometry.userData.terrainSkirtEdgeSegments = edgeSegments;
    geometry.userData.terrainSkirtTriangles = indices.length / 3;
    return geometry;
}

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
     * @param {{ search?: string, konveyorTerrainFactories?: object, konveyorMaterialFactories?: object }} [options]
     */
    constructor(scene, isMobile = false, sceneDef = null, options = {}) {
        this.scene = scene;
        this.isMobile = isMobile;
        this.sceneDef = sceneDef;
        this.konveyorTerrainSearch = options.search;
        this.konveyorTerrainFactories = options.konveyorTerrainFactories;
        this.konveyorTerrainMaterialSummary = null;
        this.konveyorMaterialSearch = options.search;
        this.konveyorMaterialFactories = options.konveyorMaterialFactories;
        this.konveyorTreeRockMaterialSummary = null;
        this.konveyorRockPlacementSearch = options.search;
        this.konveyorRockPlacementSummary = null;
        this.grassMaterial = null;
        this.grassInstanceCount = 0;
        this.grassInstancedMesh = null;

        // New advanced grass system
        this.grassSystem = null;
        this.terrainMesh = null;
        this.terrainSkirtMesh = null;
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
        // Cycle 23 Phase A2: camera-to-dog occluder fade. Shared uniform set
        // attached to every leaf MeshStandardMaterial AND propagated into
        // the kiln impostor. Each frame, uOccluderDogVS gets the dog world
        // pos transformed into camera view space; uOccluderStrength gates
        // the effect (0 = disabled, 1 = full). Capsule radius 2.0m covers a
        // dog (~1m wide, ~0.6m tall) plus a comfort margin so leaves clear
        // even when the dog is low in frame.
        this._occluder = getOccluderUniforms({ radius: 2.0, strength: 0.0 });
        // Reusable scratch so updateGrassAnimation has no per-frame alloc.
        this._occluderDogScratch = new THREE.Vector3();
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
                    let trunkMinY = Infinity;
                    let allMinY = Infinity;
                    let allMaxY = -Infinity;
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
                            if (child.name === 'trunk' && bb.min.y < trunkMinY) trunkMinY = bb.min.y;
                            if (bb.min.y < allMinY) allMinY = bb.min.y;
                            if (bb.max.y > allMaxY) allMaxY = bb.max.y;
                        }
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
                    if (!isFinite(allMinY)) { allMinY = 0; allMaxY = 1; }
                    const groundRef = isFinite(trunkMinY) ? trunkMinY : allMinY;
                    root.userData.modelBaseYOffset = -groundRef;
                    root.userData.modelBboxMinY = allMinY;
                    root.userData.modelBboxMaxY = allMaxY;
                    this.models.treesLod1[model.name] = root;
                    console.log(`[OK] Loaded tree LOD1 model: ${model.name} (baseYOffset=${root.userData.modelBaseYOffset.toFixed(3)}, bbox y=[${allMinY.toFixed(2)}, ${allMaxY.toFixed(2)}])`);
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
        await this._applyKonveyorTreeRockMaterials();

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

    _getKonveyorMaterialSearch() {
        if (this.konveyorMaterialSearch !== undefined) return this.konveyorMaterialSearch;
        if (typeof window === 'undefined') return '';
        return window.location?.search ?? '';
    }

    _getKonveyorMaterialFactories() {
        if (this.konveyorMaterialFactories !== undefined) return this.konveyorMaterialFactories;
        if (typeof window === 'undefined') return null;
        return window.__sdsKonveyorMaterialFactories ?? null;
    }

    _setKonveyorTreeRockMaterialSummary(summary) {
        this.konveyorTreeRockMaterialSummary = summary;
        if (typeof window !== 'undefined') {
            window.__sdsKonveyorMaterialAdapter = summary;
        }
        return this.konveyorTreeRockMaterialSummary;
    }

    async _applyKonveyorTreeRockMaterials() {
        const search = this._getKonveyorMaterialSearch();
        if (!shouldApplyKonveyorRendererFlag(search, 'konveyorMaterials')) {
            return this._setKonveyorTreeRockMaterialSummary({ applied: false, reason: 'flag-disabled' });
        }

        const factories = this._getKonveyorMaterialFactories();
        const hasFactories = typeof factories?.createTreeBranchMaterial === 'function'
            && typeof factories?.createTreeLeafMaterial === 'function'
            && typeof factories?.createRockMaterial === 'function';
        if (!hasFactories) {
            return this._setKonveyorTreeRockMaterialSummary({ applied: false, reason: 'missing-factories' });
        }

        const { maybeApplyKonveyorTreeRockMaterials } = await import('./world/konveyorMaterialAdapter.js');
        return this._setKonveyorTreeRockMaterialSummary(maybeApplyKonveyorTreeRockMaterials(this, {
            search,
            factories,
        }));
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

    // Shader-patch + impostor-tint helpers — bodies in js/world/shaderPatches.js.
    _patchTreeWindMaterial(material, bboxMinY, bboxMaxY) {
        runPatchTreeWind(this, material, bboxMinY, bboxMaxY);
    }
    _setupTreeWind() { runSetupTreeWind(this); }
    _patchRockMaterial(material) { runPatchRock(this, material); }
    _setupRockShader() { runSetupRockShader(this); }
    setRockRimColor(color) { runSetRockRimColor(this, color); }
    setImpostorTint(sunColor, sunDirWorld = null, ambientColor = null, sunIntensity = 1, ambientIntensity = 1) {
        runSetImpostorTint(this, sunColor, sunDirWorld, ambientColor, sunIntensity, ambientIntensity);
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
        //   Mobile now splits this into a dense 720m inner heightfield plus a
        //   cheap 3200m flat skirt. The old single 3200m mobile mesh spent
        //   most vertices in fog and left the playable hills at ~8-12m quads,
        //   which read as visible terrain lines on phone screenshots.
        const terrainTier = getSceneManager()?.getTier?.() ?? (this.isMobile ? 'low' : 'med');
        const terrainSize = this.isMobile ? 720 : 4000;
        const terrainSkirtSize = this.isMobile ? 3200 : 0;
        const terrainSkirtSegments = this.isMobile ? 8 : 0;
        const terrainSkirtTriangles = this.isMobile ? 3072 : 0;
        const terrainSegments = this.isMobile && terrainTier !== 'high' ? 256 : 384;
        const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
        this.konveyorTerrainGeometryBudget = {
            tier: terrainTier,
            isMobile: this.isMobile,
            size: terrainSize,
            segments: terrainSegments,
            skirtSize: terrainSkirtSize,
            skirtSegments: terrainSkirtSegments,
            skirtTriangles: terrainSkirtTriangles,
            splitSkirt: this.isMobile,
        };

        // Apply heightfield displacement before the mesh is rotated to lie flat.
        // Geometry is built in the XY plane; after the mesh is rotated -PI/2
        // around X, local (a, b, c) maps to world (a, c, -b). So local Z
        // displacement becomes world Y, and world (X, Z) maps to local (a, -b).
        // Heightfield owns the displacement algorithm (Cycle 30): bakeMeshGrid
        // returns a (segs+1)² array indexed iy*stride+ix in PlaneGeometry's
        // native row-major vertex order, so we just stream it onto the mesh.
        if (this.heightfield) {
            const positions = terrainGeometry.attributes.position;
            const displacedHeights = this.heightfield.bakeMeshGrid({
                segments: terrainSegments,
                size: terrainSize
            });
            for (let i = 0; i < positions.count; i++) {
                positions.setZ(i, displacedHeights[i]);
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
        const terrainColors = {
            baseColor1: new THREE.Color(0x3d5c2e),
            baseColor2: new THREE.Color(0x5a7a42),
            baseColor3: new THREE.Color(0x4a6838),
            dirtColor: new THREE.Color(0x6b5d4a),
        };
        const uniforms = THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                baseColor1: { value: terrainColors.baseColor1.clone() },
                baseColor2: { value: terrainColors.baseColor2.clone() },
                baseColor3: { value: terrainColors.baseColor3.clone() },
                dirtColor: { value: terrainColors.dirtColor.clone() }
            }
        ]);
        const createDefaultMaterial = () => new THREE.ShaderMaterial({
            uniforms,
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
        const terrainMaterialResult = createKonveyorTerrainMaterial('terrain-ground', 'createTerrainMaterial', {
            createDefaultMaterial,
            search: this.konveyorTerrainSearch,
            factories: this.konveyorTerrainFactories,
            context: {
                size: terrainSize,
                segments: terrainSegments,
                isMobile: this.isMobile,
                hasHeightfield: !!this.heightfield,
                createHeightTexture: this.heightfield
                    ? () => createKonveyorTerrainHeightTexture(this.heightfield)
                    : null,
                heightfield: this.heightfield ? {
                    width: this.heightfield.width,
                    height: this.heightfield.height,
                    worldSize: this.heightfield.worldSize,
                    peakHeight: this.heightfield.peakHeight,
                } : null,
                colors: {
                    baseColor1: terrainColors.baseColor1.clone(),
                    baseColor2: terrainColors.baseColor2.clone(),
                    baseColor3: terrainColors.baseColor3.clone(),
                    dirtColor: terrainColors.dirtColor.clone(),
                },
                noise: {
                    baseScales: [0.02, 0.05, 0.1],
                    hashVector: [127.1, 311.7],
                    fbmOctaves: 4,
                    dirtThresholds: [0.55, 0.7],
                    dirtStrength: 0.4,
                    fineDetail: [0.9, 0.2],
                    ao: [0.85, 0.15],
                },
                fog: true,
                side: THREE.FrontSide,
                polygonOffset: {
                    enabled: true,
                    factor: 1,
                    units: 1,
                },
            },
        });
        const terrainMaterial = terrainMaterialResult.material;
        terrainMaterial.userData = terrainMaterial.userData ?? {};
        terrainMaterial.userData.konveyorTerrainMaterialControls =
            terrainMaterialResult.controls ?? terrainMaterial.userData.konveyorTerrainMaterialControls ?? null;
        terrainMaterial.userData.konveyorTerrainMaterialSummary = terrainMaterialResult.summary;
        this.konveyorTerrainMaterialSummary = terrainMaterialResult.summary;

        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0;
        terrain.receiveShadow = true;
        if (this.isMobile) {
            const skirtGeometry = createTerrainSkirtGeometry(terrainSkirtSize, terrainSize, this.heightfield);
            this.konveyorTerrainGeometryBudget.skirtTriangles = skirtGeometry.userData.terrainSkirtTriangles;
            const skirt = new THREE.Mesh(skirtGeometry, terrainMaterial);
            skirt.rotation.x = -Math.PI / 2;
            skirt.position.y = -0.01;
            skirt.receiveShadow = true;
            this.scene.add(skirt);
            this.terrainSkirtMesh = skirt;
        }
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
        // Cycle 23 Phase D1: hardware tier passed through to GrassSystem
        // for per-tier presets (blade count, meadow-quad enable, wind octaves).
        const tier = getSceneManager()?.getTier?.() ?? (this.isMobile ? 'low' : 'med');
        const { GrassSystem } = await import('./GrassSystem.js');
        this.grassSystem = new GrassSystem(this.scene, this.isMobile, this.sceneDef?.grass, this.heightfield, this.sceneDef?.boundary ?? null, { tier });

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
        // Body extracted to js/world/TreePlacement.js#placeTrees.
        return placeTrees(this, competitivePastures);
    }

    _bakeTreeImpostor(model, renderer) {
        // Body extracted to js/world/TreePlacement.js#bakeTreeImpostor.
        return bakeTreeImpostor(this, model, renderer);
    }

    _createCrossBillboardGeometry(width, y0, y1) {
        // Body extracted to js/world/TreePlacement.js#createCrossBillboardGeometry.
        return createCrossBillboardGeometry(width, y0, y1);
    }

    async addEnvironmentDetails() {
        // Body extracted to js/world/RockPlacement.js#placeEnvironmentDetails.
        return placeEnvironmentDetails(this);
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

        // Cycle 23 Phase A2: occluder fade — transform dog world pos into
        // current camera view space, write into shared uniform. Strength is
        // ON when both camera + dog are present; the radius-based capsule
        // check in the shader handles the rest. A dog directly behind the
        // camera produces t=0 / closest=origin so the dist check still gates
        // correctly. No per-frame allocation: scratch Vector3 reused.
        if (this._occluder && camera?.matrixWorldInverse && playerPosition) {
            this._occluderDogScratch
                .copy(playerPosition)
                .applyMatrix4(camera.matrixWorldInverse);
            this._occluder.uOccluderDogVS.value.copy(this._occluderDogScratch);
            this._occluder.uOccluderStrength.value = 1.0;
        } else if (this._occluder) {
            this._occluder.uOccluderStrength.value = 0.0;
        }
        this._syncKonveyorTreeNodeControls(camera);
    }

    _syncKonveyorTreeNodeControls(camera = null) {
        if (!Array.isArray(this.trees) || this.trees.length === 0) return;
        const impostorSyncCount = this._konveyorTreeImpostorSync?.(this.trees, camera) ?? 0;
        if (this.konveyorNativeTreeInstancingSummary?.impostor) {
            this.konveyorNativeTreeInstancingSummary.impostor.syncedMeshes = impostorSyncCount;
        }
        const wind = this._treeWind;
        const occluder = this._occluder;
        const state = {
            windStrength: wind?.uWindStrength?.value ?? 0,
            windDirection: wind?.uWindDirection?.value ?? null,
            dogVS: occluder?.uOccluderDogVS?.value ?? null,
            occluderRadius: occluder?.uOccluderRadius?.value,
            occluderStrength: occluder?.uOccluderStrength?.value,
            occluderPeak: occluder?.uOccluderPeak?.value,
        };
        const updateMaterial = (material) => {
            const controls = material?.userData?.konveyorTreeNodeMaterialControls;
            if (!controls) return;
            controls.setWind?.({
                strength: state.windStrength,
                direction: state.windDirection,
            });
            controls.setOccluder?.({
                dogVS: state.dogVS,
                radius: state.occluderRadius,
                strength: state.occluderStrength,
                peak: state.occluderPeak,
            });
        };
        for (const mesh of this.trees) {
            const material = mesh?.material;
            if (Array.isArray(material)) {
                material.forEach(updateMaterial);
            } else {
                updateMaterial(material);
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
            Terrain: countMeshTriangles(this.terrainMesh) + countMeshTriangles(this.terrainSkirtMesh),
            Trees: sumInstancedMeshTriangles(this.trees),
            Rocks: sumInstancedMeshTriangles(this.rocks),
            Mountains: sumObjectTreeTriangles(this.mountains)
        };
    }

    getVisibleTriangleBreakdown(camera = null) {
        const visibleObjects = (objects) => {
            if (!Array.isArray(objects)) return [];
            if (!camera) return objects.filter(obj => obj?.visible !== false);

            const matrix = new THREE.Matrix4().multiplyMatrices(
                camera.projectionMatrix,
                camera.matrixWorldInverse
            );
            const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix);
            const sphere = new THREE.Sphere();
            return objects.filter(obj => {
                if (!obj || obj.visible === false) return false;
                const sourceSphere = obj.boundingSphere ?? obj.geometry?.boundingSphere ?? null;
                if (!sourceSphere) return true;
                sphere.copy(sourceSphere).applyMatrix4(obj.matrixWorld);
                return frustum.intersectsSphere(sphere);
            });
        };

        return {
            Terrain: (this.terrainMesh?.visible === false ? 0 : countMeshTriangles(this.terrainMesh))
                + (this.terrainSkirtMesh?.visible === false ? 0 : countMeshTriangles(this.terrainSkirtMesh)),
            Trees: sumInstancedMeshTriangles(visibleObjects(this.trees)),
            Rocks: sumInstancedMeshTriangles(visibleObjects(this.rocks)),
            Mountains: sumObjectTreeTriangles(visibleObjects(this.mountains))
        };
    }

    applyQualityState(state = {}) {
        this.konveyorQualityState = { ...state };
        this.grassSystem?.applyQualityState?.(state);
        const treeLodBias = Number.isFinite(state.treeLodBias)
            ? THREE.MathUtils.clamp(state.treeLodBias, 0, 0.75)
            : 0;
        for (const tree of this.trees ?? []) {
            const levels = tree?.LODinfo?.render?.levels;
            if (!levels || levels.length < 2 || typeof tree.updateLOD !== 'function') continue;
            if (!tree.userData.qualityBaseLodDistances) {
                tree.userData.qualityBaseLodDistances = levels.slice(1)
                    .map((level) => Math.sqrt(level.distance));
            }
            const baseDistances = tree.userData.qualityBaseLodDistances;
            for (let i = 0; i < baseDistances.length; i++) {
                const nextDistance = Math.max(24, baseDistances[i] * (1 - treeLodBias));
                tree.updateLOD(i + 1, nextDistance);
            }
        }
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
        // play-area heightfield blends into). Cycle 28 Stream B2 deleted the
        // legacy unreachable mountain placement code that lived under this
        // early return for ~140 LOC.
        this.mountains = [];
        console.log('[BUILD] Mountains skipped (procedural ring removed)');
        return this.mountains;
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
            if (tree.userData?.konveyorSharedMaterialFromImpostorCache) return;
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

    // Sandbox-mode rebuild — bodies in js/world/sandbox.js.
    setDynamicBounds(bounds, pasture) { runSetDynamicBounds(this, bounds, pasture); }
    updateFarmhousePosition() { runUpdateFarmhousePosition(this); }
    async rebuildEnvironment(bounds, pasture) { return runRebuildEnvironment(this, bounds, pasture); }
    async regenerateGrass(bounds, pasture) { return runRegenerateGrass(this, bounds, pasture); }

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

        const disposedTerrainMaterials = new WeakSet();
        if (this.terrainMesh) {
            if (this.terrainMesh.parent) this.terrainMesh.parent.remove(this.terrainMesh);
            this.terrainMesh.geometry?.dispose();
            if (this.terrainMesh.material) {
                if (Array.isArray(this.terrainMesh.material)) this.terrainMesh.material.forEach(m => {
                    m?.userData?.konveyorTerrainMaterialControls?.dispose?.();
                    m?.dispose?.();
                    if (m) disposedTerrainMaterials.add(m);
                });
                else {
                    this.terrainMesh.material.userData?.konveyorTerrainMaterialControls?.dispose?.();
                    this.terrainMesh.material.dispose();
                    disposedTerrainMaterials.add(this.terrainMesh.material);
                }
            }
            this.terrainMesh = null;
        }
        if (this.terrainSkirtMesh) {
            if (this.terrainSkirtMesh.parent) this.terrainSkirtMesh.parent.remove(this.terrainSkirtMesh);
            this.terrainSkirtMesh.geometry?.dispose();
            const skirtMaterial = this.terrainSkirtMesh.material;
            if (Array.isArray(skirtMaterial)) {
                skirtMaterial.forEach(m => {
                    if (m && !disposedTerrainMaterials.has(m)) m.dispose?.();
                });
            } else if (skirtMaterial && !disposedTerrainMaterials.has(skirtMaterial)) {
                skirtMaterial.dispose?.();
            }
            this.terrainSkirtMesh = null;
        }

        this.environmentDetails = [];
        this.rockPositions = [];
        this.heightfield = null;
    }
}
