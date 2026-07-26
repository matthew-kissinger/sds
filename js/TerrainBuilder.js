// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { getOccluderUniforms } from './shaders/OccluderFadePatch.js';
import { log as probeLog } from './diagnostics/glProbe.js';
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
import { placeEnvironmentDetails } from './world/RockPlacement.js';
import { getHomesteadPlayfieldPlacements } from './world/homesteadPlayfieldProps.js';
import { applyFarmhouseMaterialRoles } from './world/farmhouseMaterialRoles.js';
import {
    placeTrees,
    bakeTreeImpostor,
    createCrossBillboardGeometry,
    resolveWebGpuNativeTreeImpostorRoute
} from './world/TreePlacement.js';
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
import { createWebGpuTerrainMaterial } from './world/webgpuTerrainMaterialAdapter.js';
import {
    GROUND_APPROACH_GLSL,
    GROUND_CONTACT,
    GROUND_CONTACT_GLSL,
    GROUND_VARIATION_GLSL,
    GROUND_WEAR_GLSL,
    WORN_ZONE_SLOTS,
    WORN_ZONE_UNIFORMS,
    packWornZones,
    resolveEntityFacing,
    resolveGateApproach,
    resolveWornGroundZones,
} from './world/groundShading.js';
import { TIER_PRESETS } from './HardwareTier.js';
import { shouldApplyWebGpuRendererFlag } from './rendering/webgpuRuntimeMode.js';

// Dog (animal) rig GLBs, keyed by dogType. Only `jep` — the pre-game default
// dog buildSceneBody constructs synchronously — is loaded eagerly in
// loadModels(). The other four load on demand via loadAnimal() the moment a
// game actually selects them. Phase 1 (Cycle 45) measured all five rigs
// loading on the boot critical path though a solo game ever uses one, making
// `models` the single heaviest load stage; lazy-loading the unused four cuts
// that without changing any sim or wire behavior.
const ANIMAL_MODEL_PATHS = {
    jep: 'assets/models/Jep.glb',
    pip: 'assets/models/Pip.glb',
    sally: 'assets/models/Sally.glb',
    shiloh: 'assets/models/Shiloh.glb',
    george_washington: 'assets/models/George_Washington.glb',
};

function createWebGpuTerrainHeightTexture(heightfield) {
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
     * @param {{ search?: string, webgpuTerrainFactories?: object, webgpuMaterialFactories?: object }} [options]
     */
    constructor(scene, isMobile = false, sceneDef = null, options = {}) {
        this.scene = scene;
        this.isMobile = isMobile;
        this.sceneDef = sceneDef;
        this.webgpuTerrainSearch = options.search;
        this.webgpuTerrainFactories = options.webgpuTerrainFactories;
        this.webgpuTerrainMaterialSummary = null;
        this.webgpuMaterialSearch = options.search;
        this.webgpuMaterialFactories = options.webgpuMaterialFactories;
        this.webgpuTreeRockMaterialSummary = null;
        this.webgpuRockPlacementSearch = options.search;
        this.webgpuRockPlacementSummary = null;
        this.grassMaterial = null;
        this.grassInstanceCount = 0;
        this.grassInstancedMesh = null;

        // New advanced grass system
        this.grassSystem = null;
        this.terrainMesh = null;
        this.terrainSkirtMesh = null;
        this.environmentDetails = [];
        this.trees = []; // Track trees for removal
        // Cycle 81: GPU compute-cull controllers for the flagship (grass controller
        // lives on grassSystem; consolidated tree controllers here). Driven once per
        // frame in updateGrassAnimation, torn down in clearTrees / dispose.
        this._treeCullControllers = [];
        this._computeRenderer = null;
        this._cullReadbackTick = 0;
        this.rocks = []; // Track rocks for removal
        // Per-rock world-space footprint (populated by addEnvironmentDetails).
        // createTrees reads this to skip tree candidates that would spawn
        // inside a big rock formation. Initialised here so call-order
        // ordering (rocks-before-trees) doesn't crash if `createTrees` ever
        // runs before `addEnvironmentDetails`.
        this.rockPositions = [];
        this.mountains = []; // Track mountains
        this.buildings = []; // Track buildings
        // Cycle 114 Phase 4: last addFarmHouse() roof/wall/trim material split
        // summary, for boot diagnostics. Null until a scene with a farmhouse
        // loads (Rolling Hills and Open Country never set it).
        this.farmhouseMaterialRoleSummary = null;
        this.homesteadPlayfieldProps = [];
        this.homesteadPlayfieldPropSummary = null;
        this._homesteadPlayfieldPropLoadPromises = new Map();

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

        // Cycle 115 Phase 4: where the worn approach to the pen gate sits, or
        // null on a scene with no pen gate. Resolved once here because BOTH
        // consumers need the same answer: the terrain material bends its dirt
        // mask toward it, and the grass scatter thins over it. Deriving it twice
        // is how the two would end up describing different ground.
        /** @type {{mouth: {x: number, z: number}, axis: {x: number, z: number}, gateWidth: number} | null} */
        this.gateApproach = resolveGateApproach(sceneDef);

        // Farm house position and exclusion area — from scene if provided.
        this.farmHousePosition = sceneDef?.farmHouse?.position ?? { x: 180, z: 160 };
        this.farmHouseExclusionArea = sceneDef?.farmHouse?.exclusionArea ?? {
            minX: 140,
            maxX: 220,
            minZ: 120,
            maxZ: 200
        };

        // Cycle 121: the ground this scene has walked bare, resolved once from
        // scene data. Same reasoning as gateApproach above and the same seam:
        // the terrain material shades these zones, the grass scatter thins over
        // them, and one list means the two cannot describe different ground.
        // Resolved AFTER farmHouseExclusionArea, which it reads.
        /** @type {Array<object>} */
        this.wornZones = resolveWornGroundZones(sceneDef, {
            farmHouseArea: this.farmHouseExclusionArea,
        });

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
            // Cycle 91 Phase 6: Mountain_Group GLBs removed - addMountains
            // has been a no-op since the heightfield mountain shipped, so
            // every scene load fetched + parsed them for nothing. The GLBs
            // also stop shipping in dist (vite.config prune).
            mountains: [],
            buildings: [
                { name: 'farmhouse', path: 'assets/models/Farm house.glb' }
            ]
            // Dog rigs are no longer eager-loaded here — see ANIMAL_MODEL_PATHS
            // and loadAnimal(). loadModels() loads only jep below.
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
        //
        // Cycle 91 Phase 5: tier-gated. Only `usesLod1ForFoliage` tiers (low)
        // ever PLACE these meshes; desktop med/high was fetching + parsing
        // both GLBs on every load for nothing. createTrees already falls back
        // to the LOD0-only chain when no sibling exists.
        const lod1Tier = getSceneManager()?.getTier?.() ?? (this.isMobile ? 'low' : 'med');
        const wantsLod1 = (TIER_PRESETS[lod1Tier] ?? TIER_PRESETS.med).usesLod1ForFoliage === true
            // The explicit ?webgpuNativeTreeImpostors= route builds a desktop
            // mid-LOD1 band and keeps the full chain.
            || resolveWebGpuNativeTreeImpostorRoute().active;
        for (const model of (wantsLod1 ? modelPaths.treesLod1 : [])) {
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

        // Load only the pre-game default dog (jep) eagerly. It's the rig
        // buildSceneBody constructs synchronously before the menu picks a dog,
        // so it must be in the registry when loadModels() resolves. The other
        // four dogs load on demand via loadAnimal(). jep stays CRITICAL — a
        // failure here aborts boot exactly as the old 5-dog loop did.
        loadPromises.push(
            this._loadAnimalModel('jep', ANIMAL_MODEL_PATHS.jep).catch((err) => {
                const errMsg = `animal/jep (${ANIMAL_MODEL_PATHS.jep}): ${err.message || err}`;
                loadErrors.push(errMsg);
                criticalErrors.push(errMsg);
            })
        );

        await Promise.all(loadPromises);
        this.modelsLoaded = true;

        // Cycle 14 Phase 3: patch tree-leaf materials with the leaf-wind
        // shader. Done once at load — material refs are shared across scene
        // swaps via the GLB cache, so the patch survives.
        this._setupTreeWind();
        // Cycle 14 Phase 4: patch rock materials with fresnel rim-light.
        this._setupRockShader();
        await this._applyWebGpuTreeRockMaterials();

        // Report loading results
        const loadedAnimals = Object.keys(this.models.animals).filter(k => !k.endsWith('_animations'));
        console.log(`[ASSET] Eager dog rig(s) loaded:`, loadedAnimals, '(others load on demand via loadAnimal)');

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

    /**
     * Load one dog rig GLB into the animal registry. Shared by the eager jep
     * load in loadModels() and the on-demand loadAnimal() path. Resolves once
     * `models.animals[name]` + `[name + '_animations']` are populated; rejects
     * (after logging) if the GLB fails so callers can decide whether the
     * failure is fatal.
     * @param {string} name
     * @param {string} path
     * @returns {Promise<void>}
     */
    _loadAnimalModel(name, path) {
        return this.loader.loadAsync(path)
            .then((gltf) => {
                this.models.animals[name] = gltf.scene;
                // Cycle 91 Phase 6: the non-default dog GLBs ship WITHOUT
                // animations (scripts/bake-dog-variants.mjs strips the
                // duplicated clip set, ~800 KB x4). All five rigs share the
                // same skeleton + clip names, so Jep - the critical-loaded
                // default, guaranteed present before any dog selection - is
                // the shared clip source.
                const animations = gltf.animations?.length
                    ? gltf.animations
                    : (this.models.animals['jep_animations'] ?? []);
                this.models.animals[name + '_animations'] = animations;
                console.log(`[OK] Loaded ${name} with ${gltf.animations.length} embedded animations`
                    + `${gltf.animations.length ? '' : ` (sharing jep's ${animations.length} clips)`} from ${path}`);
            })
            .catch((err) => {
                console.error(`[ERROR] Failed to load animal/${name} (${path}): ${err.message || err}`);
                // Drop the cached promise so a later loadAnimal() can retry.
                if (this._animalLoadPromises) delete this._animalLoadPromises[name];
                throw err;
            });
    }

    /**
     * Idempotently load a dog rig on demand. Returns immediately if the rig is
     * already in the registry; otherwise fetches it once (concurrent callers
     * share the in-flight promise) and resolves when the model is ready to
     * clone in Sheepdog.loadSheepdogModel(). Best-effort: a failed load logs
     * and resolves so a missing rig degrades to the same "model not available"
     * path Sheepdog already handles rather than throwing into a frame loop.
     * @param {string} name dogType key (e.g. 'pip', 'sally').
     * @returns {Promise<void>}
     */
    async loadAnimal(name) {
        if (this.models.animals[name]) return;
        const path = ANIMAL_MODEL_PATHS[name];
        if (!path) {
            console.error(`[ASSET] Unknown dog type '${name}' — no GLB path registered`);
            return;
        }
        if (!this._animalLoadPromises) this._animalLoadPromises = {};
        if (!this._animalLoadPromises[name]) {
            this._animalLoadPromises[name] = this._loadAnimalModel(name, path);
        }
        try {
            await this._animalLoadPromises[name];
        } catch {
            // _loadAnimalModel already logged and cleared the cached promise.
        }
    }

    /**
     * Load every dog rig (idempotent). Used by the multiplayer start path,
     * where any remote player may run any of the five rigs. Returns a promise
     * that resolves once all rigs are loaded, but callers may fire-and-forget
     * it and lean on the per-rig loadAnimal() guard at each construction site.
     * @returns {Promise<void>}
     */
    preloadAllDogs() {
        return Promise.all(Object.keys(ANIMAL_MODEL_PATHS).map((name) => this.loadAnimal(name)))
            .then(() => undefined);
    }

    _getWebGpuMaterialSearch() {
        if (this.webgpuMaterialSearch !== undefined) return this.webgpuMaterialSearch;
        if (typeof window === 'undefined') return '';
        return window.location?.search ?? '';
    }

    _getWebGpuMaterialFactories() {
        if (this.webgpuMaterialFactories !== undefined) return this.webgpuMaterialFactories;
        if (typeof window === 'undefined') return null;
        return window.__sdsWebGpuMaterialFactories ?? null;
    }

    _setWebGpuTreeRockMaterialSummary(summary) {
        this.webgpuTreeRockMaterialSummary = summary;
        if (typeof window !== 'undefined') {
            window.__sdsWebGpuMaterialAdapter = summary;
        }
        return this.webgpuTreeRockMaterialSummary;
    }

    async _applyWebGpuTreeRockMaterials() {
        const search = this._getWebGpuMaterialSearch();
        if (!shouldApplyWebGpuRendererFlag(search, 'webgpuMaterials')) {
            return this._setWebGpuTreeRockMaterialSummary({ applied: false, reason: 'flag-disabled' });
        }

        const factories = this._getWebGpuMaterialFactories();
        const hasFactories = typeof factories?.createTreeBranchMaterial === 'function'
            && typeof factories?.createTreeLeafMaterial === 'function'
            && typeof factories?.createRockMaterial === 'function';
        if (!hasFactories) {
            return this._setWebGpuTreeRockMaterialSummary({ applied: false, reason: 'missing-factories' });
        }

        const { maybeApplyWebGpuTreeRockMaterials } = await import('./world/webgpuMaterialAdapter.js');
        return this._setWebGpuTreeRockMaterialSummary(maybeApplyWebGpuTreeRockMaterials(this, {
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
        //   Mobile fields split this into a dense 720m inner heightfield plus a
        //   cheap 3200m flat skirt. Coastline scenes keep the full 3200m mesh
        //   because Newsheepdogland's homestead/play area is far off origin.
        const terrainTier = getSceneManager()?.getTier?.() ?? (this.isMobile ? 'low' : 'med');
        const useMobileTerrainSkirt = this.isMobile && this.sceneDef?.boundary?.kind !== 'coastline';
        const terrainSize = this.isMobile ? (useMobileTerrainSkirt ? 720 : 3200) : 4000;
        const terrainSkirtSize = useMobileTerrainSkirt ? 3200 : 0;
        const terrainSkirtSegments = useMobileTerrainSkirt ? 8 : 0;
        const terrainSkirtTriangles = useMobileTerrainSkirt ? 3072 : 0;
        const terrainSegments = this.isMobile && terrainTier !== 'high' ? 256 : 384;
        const terrainGeometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
        this.webgpuTerrainGeometryBudget = {
            tier: terrainTier,
            isMobile: this.isMobile,
            size: terrainSize,
            segments: terrainSegments,
            skirtSize: terrainSkirtSize,
            skirtSegments: terrainSkirtSegments,
            skirtTriangles: terrainSkirtTriangles,
            splitSkirt: useMobileTerrainSkirt,
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
        }

        // Custom shader material for varied ground. Uses Three.js's standard
        // fog chunks (fog_pars_*, fog_*) instead of a hand-rolled fog so
        // `scene.fog`, which Atmosphere drives to match the sky's horizon
        // color per-frame, is the single source of truth for terrain fade.
        // Without this, terrain faded to a fixed warm-grey-green while the
        // skybox showed sky color — a visible cutoff line where the two met.
        // Cycle 90: scene-as-data palette override (terrain.colors on the
        // SceneDef). Defaults preserve the long-standing look on every scene
        // that doesn't declare one; NSL lifts its floor because its sparse
        // streamed-annulus grass leaves far more bare terrain visible than
        // the small pastures do.
        const paletteOverride = this.sceneDef?.terrain?.colors ?? null;
        const terrainColors = {
            baseColor1: new THREE.Color(paletteOverride?.base ?? 0x3d5c2e),
            baseColor2: new THREE.Color(paletteOverride?.mid ?? 0x5a7a42),
            baseColor3: new THREE.Color(paletteOverride?.high ?? 0x4a6838),
            dirtColor: new THREE.Color(paletteOverride?.dirt ?? 0x6b5d4a),
        };
        const uniforms = THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
                baseColor1: { value: terrainColors.baseColor1.clone() },
                baseColor2: { value: terrainColors.baseColor2.clone() },
                baseColor3: { value: terrainColors.baseColor3.clone() },
                dirtColor: { value: terrainColors.dirtColor.clone() },
                // Cycle 114 Phase 5: the dog's ground contact. Driven per-frame
                // by _syncGroundContact; strength stays 0 until a dog exists, so
                // the menu and attract-mode terrain render exactly as before.
                uContactPosition: { value: new THREE.Vector3(0, 0, 0) },
                uContactFacing: { value: new THREE.Vector2(0, 1) },
                uContactStrength: { value: 0 },
                // Cycle 115 Phase 4: the worn approach to the pen gate. Static
                // for the life of the material (the gate does not move), but
                // uniforms rather than baked literals so Cycle 116 can fade the
                // approach in or out without recompiling the shader. Width
                // defaults to 1 rather than 0 on a scene with no gate: the
                // shader clamps it anyway, and a zero would be one edit away
                // from NaN-ing the whole terrain colour.
                uApproachMouth: { value: new THREE.Vector2(
                    this.gateApproach?.mouth.x ?? 0,
                    this.gateApproach?.mouth.z ?? 0
                ) },
                uApproachAxis: { value: new THREE.Vector2(
                    this.gateApproach?.axis.x ?? 0,
                    this.gateApproach?.axis.z ?? 1
                ) },
                uApproachWidth: { value: this.gateApproach?.gateWidth ?? 1 },
                uApproachStrength: { value: this.gateApproach ? 1 : 0 }
            }
        ]);
        // Cycle 121: the worn zones. Assigned AFTER the merge rather than inside
        // it because UniformsUtils.clone shallow-copies an array uniform, so a
        // merged Vector4 list would be shared with the source object; these are
        // written per-frame-ish by _syncWornZones and want to be this material's
        // own. Names and slot count come from js/world/groundShading.js, which is
        // also what declares them in GROUND_WEAR_GLSL.
        const wornPack = packWornZones(this.wornZones);
        uniforms[WORN_ZONE_UNIFORMS.rect] = {
            value: wornPack.rect.map((v) => new THREE.Vector4(v[0], v[1], v[2], v[3])),
        };
        uniforms[WORN_ZONE_UNIFORMS.shape] = {
            value: wornPack.shape.map((v) => new THREE.Vector4(v[0], v[1], v[2], v[3])),
        };
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
                uniform vec3 uContactPosition;
                uniform vec2 uContactFacing;
                uniform float uContactStrength;
                uniform vec2 uApproachMouth;
                uniform vec2 uApproachAxis;
                uniform float uApproachWidth;
                uniform float uApproachStrength;

                varying vec2 vUv;
                varying vec3 vWorldPos;

                ${GROUND_VARIATION_GLSL}
                ${GROUND_CONTACT_GLSL}
                ${GROUND_APPROACH_GLSL}
                ${GROUND_WEAR_GLSL}

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
                    // Multi-scale noise for natural variation. Cycle 114 Phase 2:
                    // the low-frequency term is now the shared ground field from
                    // js/world/groundShading.js, the same one the WebGPU terrain
                    // and both grass paths read. It replaces a local 4-octave fbm
                    // at 0.02 that agreed with nothing else in the scene, so on
                    // the WebGL fallback a blade could shade browner where the
                    // ground it stood on shaded greener. n2/n3 stay as they were:
                    // they are terrain detail, not the field grass reads.
                    float n1 = sdsGroundVariation01(vWorldPos.xz);
                    float n2 = fbm(vWorldPos.xz * 0.05 + 100.0);
                    float n3 = noise(vWorldPos.xz * 0.1);

                    // Blend between green tones
                    vec3 color = mix(baseColor1, baseColor2, n1);
                    color = mix(color, baseColor3, n2 * 0.5);

                    // Add subtle dirt patches.
                    //
                    // Cycle 115 Phase 4: the worn approach to the pen gate is a
                    // shaped contribution to this SAME mask, not a second
                    // material and not a decal - the ground in front of the gate
                    // is the ground, with more reason to read as dirt. MAX
                    // rather than sum: where a natural dirt patch already sits on
                    // the approach the two do not stack into a mud slick, they
                    // agree. Both the shape and the 0.62 peak blend come from
                    // js/world/groundShading.js, so the WebGPU twin renders the
                    // same approach even though its ambient dirt strength is a
                    // per-scene 0.26-0.34 against this path's 0.4.
                    // Cycle 121: the worn zones join the SAME mask on the same
                    // terms. The pen interior, the farmhouse yard and the gate
                    // approach are one surface with three names, so they differ
                    // in shape and in intensity and never in material. MAX
                    // again, all the way down: a natural dirt patch, a worn
                    // zone and the gate fan that all land on one fragment agree
                    // with each other rather than stacking.
                    float dirtMask = smoothstep(0.55, 0.7, n1 * n2);
                    float approachDirt = sdsGroundApproachDirt(
                        vWorldPos.xz, uApproachMouth, uApproachAxis, uApproachWidth
                    ) * uApproachStrength;
                    float wornDirt = sdsGroundWearDirt(vWorldPos.xz);
                    color = mix(color, dirtColor, max(max(dirtMask * 0.4, approachDirt), wornDirt));

                    // Add fine detail variation
                    color *= 0.9 + n3 * 0.2;

                    // Subtle darkening in "low" areas (faux AO)
                    float ao = 0.85 + 0.15 * n1;
                    color *= ao;

                    // Cycle 114 Phase 5: the dog's contact darkening, on the same
                    // oriented rounded-rect footprint and the same falloff radius
                    // the grass uses, so the shadow does not change size when the
                    // dog crosses from grass onto the bald pen. Dog only.
                    color *= 1.0 - sdsGroundContact(vWorldPos.xz, uContactPosition, uContactFacing) * uContactStrength;

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
        const terrainMaterialResult = createWebGpuTerrainMaterial('terrain-ground', 'createTerrainMaterial', {
            createDefaultMaterial,
            search: this.webgpuTerrainSearch,
            factories: this.webgpuTerrainFactories,
            context: {
                size: terrainSize,
                segments: terrainSegments,
                isMobile: this.isMobile,
                hasHeightfield: !!this.heightfield,
                createHeightTexture: this.heightfield
                    ? () => createWebGpuTerrainHeightTexture(this.heightfield)
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
                // Cycle 115 Phase 4. Null on a scene with no pen gate, which is
                // how the node material knows to leave the dirt mask alone.
                approach: this.gateApproach,
                // Cycle 121. The same list the grass scatter thins over.
                wornZones: this.wornZones,
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
        terrainMaterial.userData.webgpuTerrainMaterialControls =
            terrainMaterialResult.controls ?? terrainMaterial.userData.webgpuTerrainMaterialControls ?? null;
        terrainMaterial.userData.webgpuTerrainMaterialSummary = terrainMaterialResult.summary;
        this.webgpuTerrainMaterialSummary = terrainMaterialResult.summary;

        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        terrain.position.y = 0;
        terrain.receiveShadow = true;
        if (useMobileTerrainSkirt) {
            const skirtGeometry = createTerrainSkirtGeometry(terrainSkirtSize, terrainSize, this.heightfield);
            this.webgpuTerrainGeometryBudget.skirtTriangles = skirtGeometry.userData.terrainSkirtTriangles;
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

        // Cycle 121: the farmhouse yard and the pen interior, from the one list
        // resolved in the constructor. This used to be two `addExclusionZone`
        // calls here, and the pen call was keyed on `sceneDef.pasture` - which
        // ONLY Home Field declares. Rolling Hills declares a nested `pen` rect
        // and Newsheepdogland a `pen: {center, radius}`, so neither got an
        // exclusion at all and the island pasture every ranked solo run drives
        // into had grass growing inside it (confirmed in a browser before the
        // fix, cycle121-validation/before/rh-pasture.png). The Cycle 114
        // derive-rather-than-hardcode correction for Home Field's two-metre
        // fence offset lives in resolveWornGroundZones now; see it there.
        //
        // Pushed in rather than read off the SceneDef inside GrassSystem,
        // because GrassSystem is only handed `sceneDef.grass` and giving it the
        // whole def to reach three fields would be a wider door than this needs.
        // Must land before init(), which is when the scatter runs.
        this.grassSystem.setWornZones(this.wornZones);

        // Cycle 115 Phase 4: the worn approach to the pen gate, from the same
        // resolved geometry the terrain material shades. Pushed in rather than
        // read off the SceneDef inside GrassSystem, because GrassSystem is only
        // handed `sceneDef.grass` and giving it the whole def to reach one field
        // would be a wider door than this needs. Must land before init(), which
        // is when the scatter runs.
        this.grassSystem.setGateApproach(this.gateApproach);

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


    /**
     * Push the dog's ground contact to whichever terrain material is live.
     *
     * Cycle 114 Phase 5. The grass gets its contact for free: it reuses the
     * interactor uniforms `updateInteractors` already syncs every frame. The
     * terrain has no interactor array, so it needs the dog handed to it, and
     * without this the contact term multiplies by a strength that never leaves
     * zero and the darkening is invisible on exactly the bald ground it exists
     * to cover (the pen, the farmhouse yard).
     *
     * Dog only, never sheep, matching both shaders. `entities` is the same
     * array `updateInteractors` consumes, where `type === 'sheep'` marks a
     * sheep and everything else is a dog.
     *
     * @param {Array<{position?: {x:number,y:number,z:number}, type?: string, facingDirection?: number|{x:number,z:number}}>} entities
     */
    _syncGroundContact(entities) {
        // `this.terrainMesh`, NOT `this.terrain`. TerrainBuilder has no
        // `terrain` property: the mesh is declared null at :203 and assigned at
        // :1210 as terrainMesh. The first version of this method read
        // `this.terrain?.material`, found undefined, and returned on the next
        // line every frame, so the contact term stayed exactly as dead as it was
        // before the method existed. The spec did not catch it because it built
        // its host with the wrong property name too.
        const material = this.terrainMesh?.material;
        if (!material) return;

        const dog = entities?.find?.((e) => e && e.position && e.type !== 'sheep') ?? null;

        // Facing goes through the shared resolver, NOT a local copy of the
        // rules. The first version of this method handled only
        // `facingDirection`, which is the SHEEP shape; the dog carries
        // `currentRotation` and a different forward mapping, so it fell through
        // to the +Z default and the terrain's contact never rotated with the
        // animal standing on it. One authority now, in groundShading.js next to
        // the falloff it feeds.
        const facing = resolveEntityFacing(dog);
        const fx = facing.x, fz = facing.z;
        const strength = dog ? GROUND_CONTACT.strength : 0;

        // WebGL: raw ShaderMaterial uniforms.
        const u = material.uniforms;
        if (u?.uContactStrength) {
            if (dog) u.uContactPosition.value.set(dog.position.x, dog.position.y ?? 0, dog.position.z);
            u.uContactFacing.value.set(fx, fz);
            u.uContactStrength.value = strength;
        }

        // WebGPU: node uniforms published on userData by the node material.
        const nodes = material.userData?.groundContactNodeUniforms;
        if (nodes) {
            if (dog) {
                const p = nodes.position.value;
                if (p && typeof p.set === 'function') p.set(dog.position.x, dog.position.y ?? 0, dog.position.z);
            }
            const f = nodes.facing.value;
            if (f && typeof f.set === 'function') f.set(fx, fz);
            nodes.strength.value = strength;
        }
    }

    /**
     * Push the resolved worn zones to whichever terrain material is live.
     *
     * Cycle 121. The twin of `_syncGroundContact` above and the reason Cycle 115
     * made the approach uniforms live rather than baked: a scene swap and a
     * sandbox rebuild both re-resolve the zone list, and without this the
     * terrain would keep shading the zones it booted with while the regenerated
     * grass thinned over the new ones. Two systems describing the same ground
     * and disagreeing about it is the defect this cycle exists to remove; a
     * stale uniform is just a slower way of reintroducing it.
     *
     * Never rebuilds the material. The slot count is fixed and every slot always
     * exists, so a list that grew or shrank is a uniform write.
     */
    _syncWornZones() {
        const material = this.terrainMesh?.material;
        if (!material) return;
        const pack = packWornZones(this.wornZones);

        // WebGL: two arrays of Vector4 on the raw ShaderMaterial.
        const u = material.uniforms;
        const rects = u?.[WORN_ZONE_UNIFORMS.rect]?.value;
        const shapes = u?.[WORN_ZONE_UNIFORMS.shape]?.value;
        if (Array.isArray(rects) && Array.isArray(shapes)) {
            for (let i = 0; i < WORN_ZONE_SLOTS; i++) {
                rects[i]?.set?.(pack.rect[i][0], pack.rect[i][1], pack.rect[i][2], pack.rect[i][3]);
                shapes[i]?.set?.(pack.shape[i][0], pack.shape[i][1], pack.shape[i][2], pack.shape[i][3]);
            }
        }

        // WebGPU: one uniform pair per slot, published on userData.
        const slots = material.userData?.wornGroundNodeUniforms?.slots;
        if (Array.isArray(slots)) {
            for (let i = 0; i < slots.length && i < WORN_ZONE_SLOTS; i++) {
                slots[i].rect?.value?.set?.(pack.rect[i][0], pack.rect[i][1], pack.rect[i][2], pack.rect[i][3]);
                slots[i].shape?.value?.set?.(pack.shape[i][0], pack.shape[i][1], pack.shape[i][2], pack.shape[i][3]);
            }
        }
    }

    updateGrassAnimation(deltaTime, camera, playerPosition, entities) {
        // Cycle 114 Phase 5: the terrain's contact rides the same per-frame hook
        // as the grass's, so the two cannot drift apart by a frame and the
        // shadow does not change shape as the dog crosses the grass line.
        this._syncGroundContact(entities);

        // Use new grass system if available
        if (this.grassSystem) {
            // Update interactors (player + nearby sheep + other dogs)
            if (entities) {
                this.grassSystem.updateInteractors(entities);
            }

            // Update grass system with time, camera, and player position
            this.grassSystem.update(deltaTime || 0.016, camera, playerPosition);

            // Cycle 81: drive the GPU compute-cull passes (grass + consolidated trees)
            // once per frame. runFrame early-returns during scene rebuild before this
            // is reached, so it never ticks disposed buffers.
            this._driveComputeCull(camera);
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
        this._syncWebGpuTreeNodeControls(camera);
    }

    _syncWebGpuTreeNodeControls(camera = null) {
        if (!Array.isArray(this.trees) || this.trees.length === 0) return;
        const impostorSyncCount = this._webgpuTreeImpostorSync?.(this.trees, camera) ?? 0;
        if (this.webgpuNativeTreeInstancingSummary?.impostor) {
            this.webgpuNativeTreeInstancingSummary.impostor.syncedMeshes = impostorSyncCount;
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
        // Cycle 91 Phase 4: dedupe by material. Tree meshes share a handful
        // of node materials (GLB cache + consolidation); writing the same
        // uniform objects once per MESH per frame was redundant work that
        // scaled with mesh count, not material count.
        const seen = this._treeNodeControlSeenScratch ?? (this._treeNodeControlSeenScratch = new Set());
        seen.clear();
        const updateMaterial = (material) => {
            const controls = material?.userData?.webgpuTreeNodeMaterialControls;
            if (!controls || seen.has(material)) return;
            seen.add(material);
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
        seen.clear();
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
     * Returns { Terrain, Trees, Rocks, Mountains, HomesteadProps } with zeros for any
     * category that hasn't been built yet.
     * @returns {{Terrain: number, Trees: number, Rocks: number, Mountains: number, HomesteadProps: number}}
     */
    getTriangleBreakdown() {
        return {
            Terrain: countMeshTriangles(this.terrainMesh) + countMeshTriangles(this.terrainSkirtMesh),
            Trees: sumInstancedMeshTriangles(this.trees),
            Rocks: sumInstancedMeshTriangles(this.rocks),
            Mountains: sumObjectTreeTriangles(this.mountains),
            HomesteadProps: sumObjectTreeTriangles(this.homesteadPlayfieldProps)
        };
    }

    getVisibleTriangleBreakdown(camera = null) {
        // Cycle 91 Phase 4 acceptance counter: with the perf overlay hidden
        // and no harness attached this must not advance (probe-checkable).
        this._visibleBreakdownCalls = (this._visibleBreakdownCalls ?? 0) + 1;
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
            Mountains: sumObjectTreeTriangles(visibleObjects(this.mountains)),
            HomesteadProps: sumObjectTreeTriangles(visibleObjects(this.homesteadPlayfieldProps))
        };
    }

    applyQualityState(state = {}) {
        this.webgpuQualityState = { ...state };
        this.grassSystem?.applyQualityState?.(state);
        const treeLodBias = THREE.MathUtils.clamp(state.treeLodBias || 0, 0, 0.75);
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
        for (const controller of this._treeCullControllers ?? []) {
            if (controller?.diag?.lodRole) controller.setLodBias?.(treeLodBias);
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
    updateSimpleGrassLOD(_playerPosition) {
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

    _loadHomesteadPlayfieldProp(placement) {
        let promise = this._homesteadPlayfieldPropLoadPromises.get(placement.key);
        if (!promise) {
            promise = this.loader.loadAsync(placement.path)
                .then((gltf) => gltf.scene)
                .catch((err) => {
                    this._homesteadPlayfieldPropLoadPromises.delete(placement.key);
                    throw err;
                });
            this._homesteadPlayfieldPropLoadPromises.set(placement.key, promise);
        }
        return promise;
    }

    _measureHomesteadPlayfieldProp(root) {
        let meshes = 0;
        let triangles = 0;
        root.traverse((node) => {
            if (!node.isMesh || !node.geometry) return;
            meshes += 1;
            const count = node.geometry.index?.count ?? node.geometry.attributes?.position?.count ?? 0;
            triangles += count / 3;
        });
        return { meshes, triangles: Math.round(triangles) };
    }

    _fitHomesteadPlayfieldProp(sourceRoot, placement) {
        const wrapper = new THREE.Group();
        wrapper.name = placement.name;
        wrapper.userData.homesteadPlayfieldProp = {
            key: placement.key,
            kind: placement.kind,
            paletteId: placement.paletteId,
        };

        const root = sourceRoot.clone(true);
        root.name = placement.key;
        wrapper.add(root);

        let box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        if (Number.isFinite(placement.targetHeight) && placement.targetHeight > 0 && size.y > 0) {
            root.scale.multiplyScalar(placement.targetHeight / size.y);
        }

        box = new THREE.Box3().setFromObject(root);
        const center = box.getCenter(new THREE.Vector3());
        root.position.x -= center.x;
        root.position.z -= center.z;
        root.position.y -= box.min.y;

        const castShadow = placement.kind !== 'natural-accent'
            || placement.key === 'stone-marker'
            || placement.key === 'log-pile-stump';
        root.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = castShadow;
            node.receiveShadow = true;
            node.userData.homesteadPlayfieldProp = placement.key;
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            materials.forEach((material) => {
                if (material) material.fog = true;
            });
        });

        wrapper.position.set(placement.x, this._groundY(placement.x, placement.z), placement.z);
        wrapper.rotation.y = placement.rotationY;
        wrapper.updateMatrixWorld(true);
        return wrapper;
    }

    clearHomesteadPlayfieldProps() {
        if (this.homesteadPlayfieldProps?.length) {
            for (const prop of this.homesteadPlayfieldProps) {
                if (prop.parent) prop.parent.remove(prop);
            }
        }
        this.homesteadPlayfieldProps = [];
        this.homesteadPlayfieldPropSummary = null;
    }

    async addHomesteadPlayfieldProps(sceneDef = this.sceneDef) {
        this.clearHomesteadPlayfieldProps();
        const sceneId = sceneDef?.id ?? this.sceneDef?.id ?? null;
        const placements = getHomesteadPlayfieldPlacements(sceneId);
        const summary = {
            sceneId,
            requested: placements.length,
            count: 0,
            meshes: 0,
            triangles: 0,
            assets: [],
            failed: [],
        };
        this.homesteadPlayfieldPropSummary = summary;
        if (placements.length === 0) return summary;

        await Promise.all(placements.map(async (placement) => {
            try {
                const sourceRoot = await this._loadHomesteadPlayfieldProp(placement);
                const prop = this._fitHomesteadPlayfieldProp(sourceRoot, placement);
                const cost = this._measureHomesteadPlayfieldProp(prop);
                this.scene.add(prop);
                this.homesteadPlayfieldProps.push(prop);
                summary.count += 1;
                summary.meshes += cost.meshes;
                summary.triangles += cost.triangles;
                summary.assets.push({
                    key: placement.key,
                    kind: placement.kind,
                    x: placement.x,
                    z: placement.z,
                    targetHeight: placement.targetHeight,
                    triangles: cost.triangles,
                });
            } catch (err) {
                summary.failed.push({
                    key: placement.key,
                    path: placement.path,
                    message: err?.message || String(err),
                });
            }
        }));

        console.log(`[TERRAIN] Homestead playfield props for ${sceneId}: ${summary.count}/${summary.requested} loaded, ${summary.triangles} tris`);
        return summary;
    }
    
    /**
     * Cycle 81: drive the GPU compute-cull passes once per frame. The grass
     * controller lives on the grass system; the consolidated tree controllers live
     * here. Both reference the live WebGPURenderer (resolved lazily - TerrainBuilder
     * isn't handed it). Inert when no controllers exist (every non-flagship path).
     */
    _driveComputeCull(camera) {
        if (!camera) return;
        const grassCtrl = this.grassSystem?._computeCullController ?? null;
        // Cycle 87 Phase 3: the streamed grass annulus has its own controller.
        const streamedGrassCtrl = this.grassSystem?._streamedCullController ?? null;
        const treeCtrls = this._treeCullControllers;
        if (!grassCtrl && !streamedGrassCtrl && (!treeCtrls || treeCtrls.length === 0)) return;
        const renderer = this._resolveComputeRenderer();
        if (!renderer) return;
        // Cycle 90: ONE renderer.compute(array) call for every controller's
        // reset+cull passes. Each compute() call is a full command encoder +
        // queue.submit() in the WebGPU backend; NSL's per-wave streamed
        // controllers (~110) cost 220 submits = ~21ms/frame, measured as
        // 36 vs 145 FPS median (cycle90-validation/jitter-attribution-*.json).
        // Dispatch order inside the shared pass is spec-guaranteed, so each
        // controller's reset lands before its cull exactly as before.
        const nodes = this._computeCullPassScratch ?? (this._computeCullPassScratch = []);
        nodes.length = 0;
        const collect = (ctrl) => {
            if (!ctrl || ctrl.cullDisabled || !ctrl.passes) return;
            ctrl.updateCullUniforms(camera);
            nodes.push(ctrl.passes[0], ctrl.passes[1]);
        };
        collect(grassCtrl);
        collect(streamedGrassCtrl);
        if (treeCtrls) for (let i = 0; i < treeCtrls.length; i++) collect(treeCtrls[i]);
        if (nodes.length === 0) return;
        try {
            renderer.compute(nodes);
        } catch { /* per-controller diag errors stay on the controllers */ }
        if (grassCtrl && !grassCtrl.cullDisabled) {
            this._cullReadbackTick = (this._cullReadbackTick + 1) | 0;
            if (this._cullReadbackTick % 20 === 0) {
                grassCtrl.readbackVisibleAsync(renderer)
                    .then((v) => { if (this.grassSystem && v >= 0) this.grassSystem.stats.visibleClumps = v; })
                    .catch(() => { /* ignore */ });
            }
        }
    }

    /**
     * Cycle 81: lazily resolve + cache the live WebGPURenderer (the one with
     * `.compute`). TerrainBuilder isn't handed the renderer; the SceneManager owns it.
     */
    _resolveComputeRenderer() {
        if (this._computeRenderer) return this._computeRenderer;
        try {
            const r = getSceneManager()?.getRenderer?.();
            if (r && typeof r.compute === 'function') this._computeRenderer = r;
        } catch { /* ignore */ }
        return this._computeRenderer || null;
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
            if (tree.userData?.webgpuSharedMaterialFromImpostorCache) return;
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

        // Cycle 81: dispose + clear the consolidated tree compute-cull controllers
        // (each owns a cloned geometry; the meshes were removed from the scene in the
        // loop above via the shared-cache skip). Clearing makes the per-frame driver
        // inert until the next build re-registers controllers.
        if (this._treeCullControllers?.length) {
            for (const c of this._treeCullControllers) { try { c.dispose?.(); } catch { /* ignore */ } }
        }
        this._treeCullControllers = [];
        // Cycle 91: drop the consolidated-controller registry (controllers were
        // disposed above; the far-impostor cross-billboard geometry is the one
        // piece the registry owns directly).
        if (this._treeCullRegistry) {
            for (const entry of this._treeCullRegistry.values()) {
                try { entry.farGeometry?.dispose?.(); } catch { /* ignore */ }
            }
        }
        this._treeCullRegistry = null;
        this._computeRenderer = null;

        // Cycle 88: drop the cold-coverage scatter cache + impostor range
        // bookkeeping. The impostor meshes themselves were removed/disposed
        // in the loop above (they ride this.trees like every other tree mesh).
        this._foliageColdCoverage = null;
    }
    
    /**
     * Add farm house to the scene in the northwest corner
     */
    async addFarmHouse(sceneDef = this.sceneDef) {
        // Cycle 5+: scenes with farmHouse: null (or island scenes that
        // didn't relocate the farmhouse onto the island) skip this entirely.
        // Cycle 66: take the sceneDef as a param. The autostart boot calls this
        // before setSceneDef runs, so this.sceneDef can be null here - which
        // placed the Home Field default house (180,160) out in the sea instead of
        // at the homestead pen. initWorld now passes game.currentScene.
        if (sceneDef && (sceneDef.farmHouse === null || sceneDef.farmHouse === undefined)) {
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

        // Cycle 65/66: trust the passed sceneDef for placement (the active scene
        // from initWorld). `farmHousePosition` is a cache seeded at construction
        // with the Home Field default; the autostart boot runs this before
        // setSceneDef, so reading this.sceneDef alone left the Home Field house at
        // (180,160) out in the sea. The param is the source of truth.
        if (sceneDef?.farmHouse?.position) {
            this.farmHousePosition = sceneDef.farmHouse.position;
        }
        if (sceneDef?.farmHouse?.exclusionArea) {
            this.farmHouseExclusionArea = sceneDef.farmHouse.exclusionArea;
        }

        // Position the farm house at the scene's homestead location.
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
        
        // Rotate to face the pen area. Scenes may override the default Field
        // southeast facing (Cycle 65: Newsheepdogland turns the porch toward its
        // homestead pen). Default stays 225 degrees.
        const rotDeg = sceneDef?.farmHouse?.rotationDeg;
        farmHouse.rotation.y = (rotDeg != null) ? (rotDeg * Math.PI) / 180 : Math.PI * 1.25;

        // Cycle 114 Phase 4: split the one shared palette-atlas material into a
        // roof / wall / trim trio. The GLB already separates the meshes by role;
        // what it does NOT do is give the roof its own atlas swatch - roof,
        // gables, porch roof and body walls all sample the same mid-brown, which
        // is why the house read as one tan mass. See farmhouseMaterialRoles.js
        // for the swatch table and the per-role numbers. No geometry changes:
        // D11 forbids them this cycle and none are needed. Runs before the
        // traverse below so the shadow/fog policy lands on the new materials.
        this.farmhouseMaterialRoleSummary = applyFarmhouseMaterialRoles(farmHouse);

        // House mesh casters produce oversized shadows in the dog-following
        // shadow box; restore house shadows later with a purpose-built proxy.
        farmHouse.traverse(child => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = true;
                child.userData.farmHouseShadowPolicy = 'disabled-house-caster';
                
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
        // Cycle 115 Phase 4: re-resolve, do not inherit. The approach was
        // resolved once in the constructor, and this is the documented seam for
        // repointing a persisted TerrainBuilder at a different scene, which is
        // the ordinary front-door swap path. Without this line a builder that
        // booted on Home Field carries Home Field's gate mouth into Rolling
        // Hills and Open Country and paints a dirt fan across their terrain at
        // a gate neither of them has. Unconditional assignment, so a scene with
        // no pen clears it rather than keeping the previous scene's.
        this.gateApproach = resolveGateApproach(sceneDef);
        this.grassSystem?.setGateApproach?.(this.gateApproach);
        // Cycle 121: same seam, same reasoning. A builder that booted on Home
        // Field would otherwise carry Home Field's pen and farmhouse yard onto
        // an island as two brown rectangles in open meadow.
        this.wornZones = resolveWornGroundZones(sceneDef, {
            farmHouseArea: this.farmHouseExclusionArea,
        });
        this.grassSystem?.setWornZones?.(this.wornZones);
        this._syncWornZones();
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
        try { this.clearHomesteadPlayfieldProps(); } catch (err) { console.warn('[TERRAIN] clearHomesteadPlayfieldProps threw:', err); }

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
                    m?.userData?.webgpuTerrainMaterialControls?.dispose?.();
                    m?.dispose?.();
                    if (m) disposedTerrainMaterials.add(m);
                });
                else {
                    this.terrainMesh.material.userData?.webgpuTerrainMaterialControls?.dispose?.();
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
