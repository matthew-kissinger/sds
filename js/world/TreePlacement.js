// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
/**
 * Tree placement, impostor baking, and cross-billboard helpers extracted
 * from `TerrainBuilder` in Cycle 28 Stream B2.
 *
 * Reads `builder.sceneDef`, `builder.rockPositions`, `builder.models.trees`,
 * `builder.models.treesLod1`, `builder.scene`, `builder.isMobile`,
 * `builder._probeRender`, `builder._bakeImpostorCache`,
 * `builder._lod2EmptyGeoCache`; mutates `builder.treeInstances`,
 * `builder._impostorMaterials`, `builder.trees`.
 *
 * Behavior is unchanged from the inline methods — same seeded
 * `generateTrees` call, same per-instance LOD chain, same Pixel Forge
 * Kiln impostor preference, same cross-billboard fallback. The
 * scatter-positions characterization golden tracks `generateTrees`
 * output bit-for-bit; this module is just the placement-into-Three.js
 * stage.
 */

import * as THREE from 'three';
import { InstancedMesh2 } from '@three.ez/instanced-mesh';

import { generateTrees } from '../../shared/TreePlacement.js';
import { mulberry32 } from '../../shared/Random.js';
import { loadKilnImpostor, createKilnImpostorGeometry } from '../kiln-impostor-material.js';
import { getSceneManager } from '../GameBridge.js';
import { createTreeComputeCull } from './treeComputeCull.js';
import { getWebGpuModules } from './webgpuModules.js';
import { TIER_PRESETS } from '../HardwareTier.js';
import { shouldUseWebGpuProductionNativeInstancing } from '../rendering/webgpuRuntimeMode.js';
import { suppressShadowOverrideVersionChurn } from '../rendering/shadowOverrideMaterialFix.js';
import { resolveImpostorBase } from './objectImpostorManifest.js';
import { loadImpostorTexture } from '../rendering/ktx2Loader.js';

const HYBRID_TREE_LOD1_SWITCH_DISTANCE = 56;
const HYBRID_TREE_IMPOSTOR_SWITCH_DISTANCE = 144;
let treeImpostorRuntimePromise = null;

// Cycle 91 P1: alpha-carded leaf meshes are the entire tree shadow cost.
// The r184 WebGPU shadow pass does not apply alphaHash, so hashed leaf
// cards cast solid quads anyway while still paying their color-texture
// fetch per depth fragment. Opaque trunk/branch meshes keep casting:
// NSL driven probe measured 142.9 median / 64.8 1%-low with leaf casters
// off vs 71.9 / 44.6 with them on (cycle91-validation/shadow-spike-main
// .json). Far impostors never cast (durable rule).
function materialCastsShadow(material) {
    const mats = Array.isArray(material) ? material : [material];
    return !mats.some(m => m && (m.alphaHash === true || m.alphaTest > 0 || m.transparent === true));
}

/**
 * Cycle 91 (Phase 2.5 item 4): camera-XZ distance past which consolidated
 * LOD0 trees hand off to the per-type far-impostor controller. Camera-relative
 * distance is safe on the compute path (per-frame data-compaction, no mesh/render-list
 * switching), unlike the WebGL billboard rule's distance-from-origin
 * requirement.
 */
export const CONSOLIDATED_MIN_FAR_SWITCH_DISTANCE = 96;

function getConsolidatedTreeLodBaseDistance(sceneDef) {
    const kind = sceneDef?.boundary?.kind;
    return kind === 'island' ? 280 : sceneDef?.consolidatedTrees === true && kind !== 'coastline' ? 320 : 220;
}

function applyConsolidatedTreeLodBias(baseDistance, qualityState = {}) {
    return Math.max(96, baseDistance * (1 - (qualityState.treeLodBias || 0)));
}

export function resolveConsolidatedTreeLodProfile(sceneDef, qualityState = {}) {
    const baseDistance = getConsolidatedTreeLodBaseDistance(sceneDef);
    return {
        baseDistance,
        distance: applyConsolidatedTreeLodBias(baseDistance, qualityState),
    };
}

/**
 * Cycle 91 Phase 2: layer for shadow-only canopy casters. The main camera
 * renders layer 0 only; the bridge sun's shadow camera additionally enables
 * this layer, so the cross-billboard casters are depth-pass-only. Verified
 * against three.js #33730 on r184 in the live scene (instanced receivers
 * stay lit): cycle91-validation/shadow-layer-probe/.
 */
export const TREE_SHADOW_LAYER = 2;

const _appendDummy = new THREE.Object3D();

function writeConsolidatedTreeData(instances, baseOffset, matrices, offsets) {
    instances.forEach((inst, i) => {
        _appendDummy.position.copy(inst.position);
        if (Number.isFinite(inst.groundY)) {
            const scaleScalar = Number.isFinite(inst.scaleScalar)
                ? inst.scaleScalar
                : (Number.isFinite(inst.scale?.y) ? inst.scale.y : 1);
            _appendDummy.position.y = inst.groundY + (baseOffset ?? 0) * scaleScalar;
        }
        _appendDummy.quaternion.setFromEuler(inst.rotation);
        _appendDummy.scale.copy(inst.scale);
        _appendDummy.updateMatrix();
        _appendDummy.matrix.toArray(matrices, i * 16);
        offsets[i * 3] = _appendDummy.position.x;
        offsets[i * 3 + 1] = _appendDummy.position.y;
        offsets[i * 3 + 2] = _appendDummy.position.z;
    });
}

// Impostor quads sit at groundY with the scatter's own rotation + scale -
// the same transform recipe as the cold-coverage cross-billboards, so the
// far ring matches what the loading impostors already showed.
function writeConsolidatedImpostorData(instances, matrices, offsets) {
    instances.forEach((inst, i) => {
        _appendDummy.position.copy(inst.position);
        if (Number.isFinite(inst.groundY)) _appendDummy.position.y = inst.groundY;
        _appendDummy.quaternion.setFromEuler(inst.rotation);
        _appendDummy.scale.copy(inst.scale);
        _appendDummy.updateMatrix();
        _appendDummy.matrix.toArray(matrices, i * 16);
        offsets[i * 3] = _appendDummy.position.x;
        offsets[i * 3 + 1] = _appendDummy.position.y;
        offsets[i * 3 + 2] = _appendDummy.position.z;
    });
}

function collectLod0MeshDefs(builder, treeType) {
    const model = builder.models.trees[treeType];
    if (!model) return [];
    const meshDefs = [];
    model.traverse(child => {
        if (!child.isMesh || !child.geometry) return;
        meshDefs.push({
            geometry: child.geometry,
            material: child.material,
            meshName: child.name || '(unnamed)',
            sourceLod: 'lod0',
            baseOffset: model.userData?.modelBaseYOffset ?? 0,
        });
    });
    return meshDefs;
}

const EMPTY_F32 = new Float32Array(0);

function makeLod0Controller(builder, cullModules, treeType, meshDef, init) {
    const lodBase = getConsolidatedTreeLodBaseDistance(builder.sceneDef);
    const controller = createTreeComputeCull(cullModules, {
        geometry: meshDef.geometry,
        material: meshDef.material,
        matrices: init.matrices,
        offsets: init.offsets,
        count: init.count,
        capacity: init.capacity,
        castShadow: !builder.isMobile && materialCastsShadow(meshDef.material),
        lodRole: 'near',
        lodDistance: applyConsolidatedTreeLodBias(lodBase, builder.webgpuQualityState),
        lodBase,
        lodEnabled: init.lodEnabled ?? false,
    });
    controller.diag.treeType = treeType;
    controller.diag.meshName = meshDef.meshName ?? null;
    const im = controller.mesh;
    // clearTrees removes it from the scene; the controller owns the cloned
    // geometry disposal and the material is shared -> skip both in clearTrees.
    im.userData.sharedFromGlbCache = true;
    im.userData.webgpuNativeInstancing = 'tree';
    im.userData.webgpuNativeChunkKey = 'consolidated';
    im.userData.webgpuTreeType = treeType;
    builder.scene.add(im);
    builder._treeCullControllers.push(controller);
    return controller;
}

/**
 * Cycle 91 Phase 3: per-type consolidated controller registry. One appendable
 * compute-cull controller per (treeType x LOD0 child-mesh) plus at most one
 * far-impostor controller per type - streamed waves append instances instead
 * of minting per-wave controllers (~108 on NSL -> <= 8).
 */
function getOrCreateConsolidatedEntry(builder, cullModules, treeType, meshDefs, initialCapacity) {
    if (!builder._treeCullRegistry) builder._treeCullRegistry = new Map();
    let entry = builder._treeCullRegistry.get(treeType);
    if (entry) return { entry, created: false };
    const capacity = Math.max(initialCapacity, 1);
    entry = {
        treeType,
        used: 0,
        capacity,
        lod0: [],
        far: null,
        farGeometry: null,
        shadowCaster: null,
        impostorMatrices: new Float32Array(capacity * 16),
        impostorOffsets: new Float32Array(capacity * 3),
    };
    for (const meshDef of meshDefs) {
        const controller = makeLod0Controller(builder, cullModules, treeType, meshDef, {
            matrices: EMPTY_F32, offsets: EMPTY_F32, count: 0, capacity,
        });
        entry.lod0.push({ meshDef, controller });
    }
    builder._treeCullRegistry.set(treeType, entry);
    return { entry, created: true };
}

function replaceTrackedController(builder, oldCtrl, fresh) {
    const oldMesh = oldCtrl.mesh;
    builder.scene.remove(oldMesh);
    if (Array.isArray(builder.trees)) {
        const ti = builder.trees.indexOf(oldMesh);
        if (ti >= 0) builder.trees.splice(ti, 1, fresh.mesh);
        else if (!builder.trees.includes(fresh.mesh)) builder.trees.push(fresh.mesh);
    }
    const ci = builder._treeCullControllers?.indexOf(oldCtrl) ?? -1;
    if (ci >= 0) builder._treeCullControllers.splice(ci, 1);
    oldCtrl.dispose();
}

function createCanopyShadowInstanceMatrix(cullModules, entry) {
    const Attribute = cullModules?.StorageInstancedBufferAttribute ?? THREE.InstancedBufferAttribute;
    const attr = new Attribute(entry.impostorMatrices, 16);
    attr.needsUpdate = true;
    return attr;
}

/**
 * Grow a type entry to `neededCapacity` by rebuilding its controllers with
 * larger source stores. Happens at most once per scene load on the normal
 * path (reserveConsolidatedTreeCapacity sizes exactly from the cold-coverage
 * scatter cache, behind the load overlay); the x2 headroom covers the
 * no-cache live-scatter fallback.
 */
function growConsolidatedEntry(builder, cullModules, entry, neededCapacity) {
    if (neededCapacity <= entry.capacity) return;
    const capacity = Math.max(neededCapacity, Math.ceil(entry.capacity * 2));
    for (const slot of entry.lod0) {
        const old = slot.controller;
        const state = old.getAppendState();
        const fresh = makeLod0Controller(builder, cullModules, entry.treeType, slot.meshDef, {
            matrices: state.matrices,
            offsets: state.offsets,
            count: state.used,
            capacity,
            lodEnabled: old.diag.lodEnabled,
        });
        replaceTrackedController(builder, old, fresh);
        slot.controller = fresh;
    }
    const newIM = new Float32Array(capacity * 16);
    newIM.set(entry.impostorMatrices.subarray(0, entry.used * 16));
    const newIO = new Float32Array(capacity * 3);
    newIO.set(entry.impostorOffsets.subarray(0, entry.used * 3));
    entry.impostorMatrices = newIM;
    entry.impostorOffsets = newIO;
    if (entry.far) {
        const oldFar = entry.far;
        const fresh = makeFarImpostorController(builder, cullModules, entry, () => oldFar.mesh.material);
        replaceTrackedController(builder, oldFar, fresh);
        entry.far = fresh;
    }
    if (entry.shadowCaster) {
        // The caster's instanceMatrix wraps the (reallocated) impostor store;
        // rebuild it on the new array, reusing geometry + material.
        const old = entry.shadowCaster;
        const fresh = new THREE.InstancedMesh(old.geometry, old.material, capacity);
        fresh.instanceMatrix = createCanopyShadowInstanceMatrix(cullModules, entry);
        fresh.count = entry.used;
        fresh.castShadow = true;
        fresh.receiveShadow = false;
        fresh.frustumCulled = false;
        fresh.layers.set(TREE_SHADOW_LAYER);
        fresh.userData.webgpuTreeCanopyShadowCaster = true;
        fresh.userData.webgpuTreeType = entry.treeType;
        // Keep clearTrees from double-disposing the shared geometry/material
        // through the OLD mesh: swap it out of builder.trees in place.
        builder.scene.remove(old);
        builder.scene.add(fresh);
        if (Array.isArray(builder.trees)) {
            const ti = builder.trees.indexOf(old);
            if (ti >= 0) builder.trees.splice(ti, 1, fresh);
            else builder.trees.push(fresh);
        }
        old.dispose(); // instance attributes only; geometry/material live on
        entry.shadowCaster = fresh;
    }
    entry.capacity = capacity;
}

/**
 * Cycle 91 Phase 2: shadow-only canopy caster. One plain InstancedMesh per
 * type, kiln cross-billboard geometry (18 verts/tree), alphaTest material
 * with a plain map fetch (no colorNode graph - the r184 shadow pass ignores
 * alphaHash but honors alphaTest), covering EVERY landed tree. Lives on
 * TREE_SHADOW_LAYER so only the shadow camera renders it; LOD0 trunks keep
 * casting sharp near shadows, the billboards restore the canopy mass that
 * P1 took out of the depth pass.
 */
function makeCanopyShadowCaster(builder, cullModules, entry, sidecar, texture) {
    const sun = getSceneManager()?.webgpuSunLight ?? null;
    if (builder.isMobile || !sun?.userData?.shadowConfigured || !texture) return null;
    const geometry = createColdImpostorGeometry(sidecar, 0);
    const material = new THREE.MeshBasicMaterial({
        map: texture,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
    });
    const capacity = entry.impostorMatrices.length / 16;
    const caster = new THREE.InstancedMesh(geometry, material, capacity);
    caster.instanceMatrix = createCanopyShadowInstanceMatrix(cullModules, entry);
    caster.count = entry.used;
    caster.castShadow = true;
    caster.receiveShadow = false;
    // The shadow camera's dog-following box does the culling; 18 verts per
    // instance keeps a full-island depth draw trivial.
    caster.frustumCulled = false;
    caster.layers.set(TREE_SHADOW_LAYER);
    // clearTrees disposes its own geometry + material (map nulled there, so
    // the cached atlas texture survives the swap) - no shared-cache tag.
    caster.userData.webgpuTreeCanopyShadowCaster = true;
    caster.userData.webgpuTreeType = entry.treeType;
    // Cycle 92: this caster is what introduces alphaTest > 0 into the depth
    // pass (everything else casting is opaque), so it installs the shared
    // shadow override material's version-churn fix on its first shadow
    // render. One-shot; see shadowOverrideMaterialFix.js for the mechanism.
    caster.onBeforeShadow = (_r, _o, _c, _sc, _g, overrideMaterial) => {
        suppressShadowOverrideVersionChurn(overrideMaterial);
        caster.onBeforeShadow = () => {};
    };
    sun.shadow.camera.layers.enable(TREE_SHADOW_LAYER);
    builder.scene.add(caster);
    return caster;
}

function makeFarImpostorController(builder, cullModules, entry, materialFactory) {
    const lodBase = getConsolidatedTreeLodBaseDistance(builder.sceneDef);
    const far = createTreeComputeCull(cullModules, {
        geometry: entry.farGeometry,
        // Cycle 101: the far material reads the compacted instance buffer by
        // index, so it is built by a factory once that buffer exists.
        materialFactory,
        matrices: entry.impostorMatrices,
        offsets: entry.impostorOffsets,
        count: entry.used,
        capacity: entry.impostorMatrices.length / 16,
        castShadow: false, // durable far-impostor rule
        receiveShadow: false,
        lodRole: 'far',
        lodDistance: applyConsolidatedTreeLodBias(lodBase, builder.webgpuQualityState),
        lodBase,
    });
    far.diag.treeType = entry.treeType;
    far.diag.meshName = 'far-impostor';
    const im = far.mesh;
    im.userData.sharedFromGlbCache = true; // coverage meshes own the material teardown
    im.userData.webgpuNativeInstancing = 'tree';
    im.userData.webgpuNativeChunkKey = 'consolidated-far';
    im.userData.webgpuTreeType = entry.treeType;
    builder.scene.add(im);
    builder._treeCullControllers.push(far);
    return far;
}

/**
 * Append a wave (or the cold corridor) of one type's instances into the
 * consolidated controllers, creating them on first use. Returns the entry
 * plus any meshes created (callers track them for teardown).
 */
export function appendConsolidatedTreeInstances(builder, cullModules, treeType, instances, opts = {}) {
    const createdMeshes = [];
    if (!builder._treeCullControllers) builder._treeCullControllers = [];
    let entry = builder._treeCullRegistry?.get(treeType) ?? null;
    if (!entry) {
        const meshDefs = opts.meshDefs ?? collectLod0MeshDefs(builder, treeType);
        if (!meshDefs.length) return { entry: null, createdMeshes };
        const made = getOrCreateConsolidatedEntry(builder, cullModules, treeType, meshDefs, instances.length);
        entry = made.entry;
        if (made.created) for (const slot of entry.lod0) createdMeshes.push(slot.controller.mesh);
    }
    growConsolidatedEntry(builder, cullModules, entry, entry.used + instances.length);
    const n = instances.length;
    const m = new Float32Array(n * 16);
    const o = new Float32Array(n * 3);
    for (const slot of entry.lod0) {
        writeConsolidatedTreeData(instances, slot.meshDef.baseOffset ?? 0, m, o);
        slot.controller.append(m, o, n);
    }
    // The impostor store rides every append so the far controller (created
    // when the kiln atlas resolves) always covers exactly the landed LOD0
    // set - never an un-landed wave, which the cold coverage still shows.
    writeConsolidatedImpostorData(instances, m, o);
    if (entry.far) {
        entry.far.append(m, o, n);
    } else {
        entry.impostorMatrices.set(m.subarray(0, n * 16), entry.used * 16);
        entry.impostorOffsets.set(o.subarray(0, n * 3), entry.used * 3);
    }
    entry.used += n;
    // Cycle 91 Phase 2: the canopy shadow caster shares the impostor store;
    // appends just extend its live count and re-upload.
    if (entry.shadowCaster) {
        entry.shadowCaster.count = entry.used;
        entry.shadowCaster.instanceMatrix.needsUpdate = true;
    }
    return { entry, createdMeshes };
}

/**
 * Size the consolidated controllers for the whole island in one pass. Called
 * by buildColdFoliageCoverage right after the wave scatter cache is built -
 * still inside the load transition, so the one-time controller rebuild hides
 * behind the swap overlay and wave appends later never reallocate.
 */
export function reserveConsolidatedTreeCapacity(builder, flatTrees) {
    const registry = builder._treeCullRegistry;
    if (!registry || !flatTrees?.length) return;
    const cullModules = getWebGpuModules();
    if (!cullModules?.TSL) return;
    const counts = {};
    for (const t of flatTrees) counts[t.type] = (counts[t.type] ?? 0) + 1;
    for (const [type, add] of Object.entries(counts)) {
        const entry = registry.get(type);
        if (entry) growConsolidatedEntry(builder, cullModules, entry, entry.used + add);
    }
}

/**
 * Cycle 91 (Phase 2.5 item 4) + Cycle 101 Phase 4: activate the full LOD chain
 * on the consolidated path. Once a type's atlases resolve, create its far-
 * impostor controller (everything beyond the switch distance renders as the
 * view-dependent relit octahedral impostor - Cycle 101, replacing the static
 * column-0 cross-billboard) and flip the LOD0 controllers' near gate on. Until
 * then LOD0 renders island-wide - exactly the pre-91 behavior - so a failed
 * atlas fetch degrades to the shipped look, never to absent trees.
 *
 * The far material reads each instance's transform from the cull's compacted
 * storage buffer in-shader (the only thing that works with data-compaction's
 * shifting slot order), so it is built by a factory once that buffer exists. The
 * `latlon` atlas (`atlasByType`) still feeds the canopy shadow caster; the
 * octahedral atlas (albedo + capture-view normal) is loaded here for the far
 * band. `_materialsByType` (cold cross-billboard materials) is no longer used by
 * the far controller - kept in the signature for the existing call site.
 */
export function enableConsolidatedFarImpostors(builder, atlasByType, _materialsByType, opts = {}) {
    const registry = builder._treeCullRegistry;
    const cullModules = getWebGpuModules();
    if (!registry || !cullModules?.TSL) return 0;
    const sceneFog = builder.scene?.fog ?? null;
    const fogDef = builder.sceneDef?.fog ?? {};
    const fog = {
        color: sceneFog?.color ? [sceneFog.color.r, sceneFog.color.g, sceneFog.color.b] : [0.8, 0.8, 0.8],
        near: fogDef.near ?? sceneFog?.near ?? 60,
        far: fogDef.far ?? sceneFog?.far ?? 400,
        strength: 0.5,
    };
    let scheduled = 0;
    for (const [treeType, entry] of registry) {
        const latlonAtlas = atlasByType?.[treeType]; // cold albedo, for the canopy shadow caster
        if (!latlonAtlas?.sidecar || entry.far) continue;
        scheduled++;
        // Octahedral atlas (albedo + capture-view normal) drives the view-
        // dependent relit far material; cold coverage + the shadow caster stay
        // on the latlon albedo (unchanged fallback).
        loadOctahedralImpostorAtlas(treeType).then(async (oct) => {
            if (!oct?.sidecar || opts.signal?.aborted) return;
            if (builder._treeCullRegistry !== registry || entry.far) return; // scene swapped / raced
            const [albedoTex, normalTex] = await Promise.all([oct.albedoPromise, oct.normalPromise]);
            if (!albedoTex || !normalTex || opts.signal?.aborted) return;
            if (builder._treeCullRegistry !== registry || entry.far) return;
            try {
                // Dynamic import keeps the WebGPU-only impostor material in the
                // webgpu chunk (it ships nowhere WebGL/mobile can reach), so the
                // main bundle stays lean - it is only fetched when a coastline/
                // island scene actually arms its far band.
                const { createWebGpuConsolidatedTreeImpostorMaterial } =
                    await import('../webgpuKilnImpostorNodeMaterial.js');
                const directionsTexture = buildImpostorDirectionsTexture(oct.sidecar);
                // Camera-facing quad sized to the bake frustum; the material's
                // vertexNode billboards + view-selects it per instance.
                entry.farGeometry = createKilnImpostorGeometry(oct.sidecar);
                const far = makeFarImpostorController(builder, cullModules, entry, ({ instanceMatricesAttr, capacity }) => {
                    const mat = createWebGpuConsolidatedTreeImpostorMaterial(cullModules, {
                        instanceMatricesAttr,
                        capacity,
                        sidecar: oct.sidecar,
                        albedoAtlas: albedoTex,
                        normalAtlas: normalTex,
                        directionsTexture,
                        fog,
                    });
                    // setImpostorTint drives sun/ambient/ground-bounce per frame.
                    if (!builder._impostorMaterials) builder._impostorMaterials = [];
                    builder._impostorMaterials.push(mat);
                    return mat;
                });
                if (Array.isArray(builder.trees)) builder.trees.push(far.mesh);
                entry.far = far;
                for (const slot of entry.lod0) slot.controller.setLodEnabled(true);
                opts.onFarImpostorActive?.(treeType, entry.used);
                // Cycle 91 Phase 2: the canopy shadow caster rides the latlon
                // albedo (depth-pass alpha mask only, no view dependence). Once
                // it exists it is the SOLE tree caster: the LOD0 trunks stop
                // casting (trunk+billboard double-cast cost ~0.7ms/frame and a
                // double-shadow smudge). One-time toggle at arm, never per-frame.
                latlonAtlas.texturePromise?.then((latTex) => {
                    if (!latTex || opts.signal?.aborted) return;
                    if (builder._treeCullRegistry !== registry) return;
                    entry.shadowCaster = makeCanopyShadowCaster(builder, cullModules, entry, latlonAtlas.sidecar, latTex);
                    if (entry.shadowCaster) {
                        if (Array.isArray(builder.trees)) builder.trees.push(entry.shadowCaster);
                        for (const slot of entry.lod0) slot.controller.mesh.castShadow = false;
                    }
                });
                // Best-effort WebGPU pipeline prewarm for the one new mesh.
                // WebGL compileAsync can keep polling after teardown, so WebGL
                // takes the normal lazy compile path.
                try {
                    const renderer = builder._resolveComputeRenderer?.()
                        ?? getSceneManager()?.getRenderer?.()
                        ?? null;
                    const camera = getSceneManager()?.getCamera?.() ?? null;
                    if (renderer?.isWebGPURenderer && renderer.compileAsync && camera) {
                        renderer.compileAsync(builder.scene, camera).catch(() => { /* best-effort */ });
                    }
                } catch { /* best-effort */ }
                console.log(`[FOLIAGE] far-impostor LOD active for ${treeType}: ${entry.used} instances, view-dependent octahedral`);
            } catch (err) {
                console.warn(`[FOLIAGE] far-impostor LOD enable failed for ${treeType}:`, err);
            }
        });
    }
    return scheduled;
}

/**
 * Cycle 101 Phase 5: arm the consolidated far-impostor band for an all-cold
 * island (Rolling Hills, Open Country - no streamed waves). The cold build
 * populated `_treeCullRegistry` with the whole island's LOD0 controllers; this
 * loads the latlon cold atlas per registered type (it feeds the canopy shadow
 * caster; the octahedral far material loads its own atlas inside
 * enableConsolidatedFarImpostors) and hands off. Detached: the cold build
 * returns immediately and the far band lights up when the atlases resolve, so a
 * failed fetch degrades to LOD0-island-wide, never to absent trees.
 *
 * Streamed scenes (Newsheepdogland) arm the band from the cold-coverage
 * continuation in foliageStreaming instead; the call site gates this on the
 * absence of `streamedZones` so they are never double-enabled. Scene-swap safety
 * rides the registry-identity guard inside enableConsolidatedFarImpostors (the
 * builder has no abort signal here; clearTrees nulls the registry on swap).
 *
 * @param {object} builder TerrainBuilder instance.
 */
function armAllColdFarImpostors(builder) {
    const registry = builder._treeCullRegistry;
    if (!registry?.size) return;
    (async () => {
        try {
            const atlasByType = {};
            await Promise.all([...registry.keys()].map(async (type) => {
                atlasByType[type] = await loadColdImpostorAtlas(type);
            }));
            if (builder._treeCullRegistry !== registry) return; // scene swapped mid-load
            enableConsolidatedFarImpostors(builder, atlasByType, {}, {});
        } catch (err) {
            console.warn('[FOLIAGE] all-cold far-impostor arm failed (island keeps LOD0-island-wide):', err);
        }
    })();
}

export function resolveWebGpuNativeTreeImpostorRoute(search = (typeof window === 'undefined' ? '' : window.location.search)) {
    const params = new URLSearchParams(search);
    const mode = params.get('webgpuNativeTreeImpostors');
    const useOctahedral = mode === '1' || mode === 'octahedral';
    const useLatLonRollback = mode === 'latlon';
    const active = useOctahedral || useLatLonRollback;
    return {
        mode,
        active,
        useOctahedral,
        useLatLonRollback,
        baseDir: useOctahedral ? 'assets/models/trees/octahedral' : 'assets/models/trees',
        lod: useOctahedral
            ? 'production-hybrid-lod0-octahedral-v2-impostor-explicit'
            : useLatLonRollback ? 'rollback-hybrid-lod0-latlon-hemi-impostor-explicit' : null,
        runtimeMode: useOctahedral
            ? 'octahedral-production'
            : useLatLonRollback ? 'latlon-hemi-rollback' : null,
        sidecarLayout: active ? (useOctahedral ? 'octahedral' : 'latlon-hemi-y') : null,
        sidecarVersion: active ? (useOctahedral ? 2 : 1) : null,
        rollbackQuery: '?renderer=webgpu&webgpuNativeTreeImpostors=latlon',
    };
}

function loadTreeImpostorRuntime() {
    if (!treeImpostorRuntimePromise) {
        treeImpostorRuntimePromise = import('./TreeImpostorRuntime.js');
    }
    return treeImpostorRuntimePromise;
}

function computeChunkCenter(instances) {
    const center = new THREE.Vector3();
    if (!instances.length) return center;
    for (const inst of instances) center.add(inst.position);
    return center.multiplyScalar(1 / instances.length);
}

/**
 * Cycle 101 Phase 5: consolidated compute-cull eligibility by structural
 * boundary kind. Coastline (Newsheepdogland, streamed) plus island (Rolling
 * Hills, Open Country, both all-cold) take the per-instance GPU cull + the
 * view-dependent far-impostor band. Home Field (`rect`) stays per-chunk. Broadened
 * from coastline-only this cycle so the islands inherit the Phase 3/4 impostor;
 * gates on the boundary kind, not a scene id (scene-and-render.md rule).
 *
 * @param {object} [sceneDef] the active SceneDef.
 * @returns {boolean}
 */
export function usesConsolidatedTreeCull(sceneDef) {
    const kind = sceneDef?.boundary?.kind;
    // Cycle 104 Phase 2 (Option B): a flat scene with no island/coastline boundary
    // can opt into the consolidated cull + far-impostor band via the explicit
    // `consolidatedTrees` SceneDef flag (Home Field). Gates on the structural flag,
    // never a scene id (scene-and-render.md). The all-cold arm path already handles
    // non-streamed scenes (armAllColdFarImpostors, gated on !streamedZones); the
    // flag just lets the registry build so size() > 0 there.
    return kind === 'coastline' || kind === 'island' || sceneDef?.consolidatedTrees === true;
}

async function createNativeTreeInstancedMeshes(builder, treeInstances) {
    const instancedMeshes = [];
    const groups = [];
    const dummy = new THREE.Object3D();
    const hwTier = getSceneManager()?.getTier?.() ?? (builder.isMobile ? 'low' : 'med');
    const totalTrees = Object.values(treeInstances).reduce((s, a) => s + a.length, 0);
    const useMobileNativeLod1 = hwTier === 'low';
    const impostorRoute = resolveWebGpuNativeTreeImpostorRoute();
    const useProductionNativeImpostor = impostorRoute.active;
    const _tRuntime = useProductionNativeImpostor ? performance.now() : 0;
    const treeImpostorRuntime = useProductionNativeImpostor ? await loadTreeImpostorRuntime() : null;
    if (useProductionNativeImpostor) {
        builder._sdsImpostorMs = (builder._sdsImpostorMs ?? 0) + (performance.now() - _tRuntime);
    }
    builder._webgpuTreeImpostorSync = treeImpostorRuntime?.syncWebGpuTreeImpostorMeshes ?? null;
    const chunkSize = useProductionNativeImpostor ? 160 : (builder.isMobile ? 320 : 192);

    // Cycle 84: on the flagship coastline WebGPU path consolidate the per-chunk
    // tree fan-out into ONE compute-culled InstancedMesh per child-mesh
    // (data-compaction storage instanceMatrix + indirect draw). Null on WebGL
    // and non-coastline paths -> per-chunk fan-out.
    const treeCullModules = (usesConsolidatedTreeCull(builder.sceneDef) && !useProductionNativeImpostor)
        ? (getWebGpuModules() || null)
        : null;
    if (treeCullModules?.TSL) {
        builder._treeCullControllers = []; // fresh per build; prior controllers disposed by clearTrees
        builder._treeCullRegistry = new Map();
    }

    for (const [treeType, instances] of Object.entries(treeInstances)) {
        if (instances.length === 0 || !builder.models.trees[treeType]) continue;

        const meshDefs = [];
        const _tKiln = useProductionNativeImpostor ? performance.now() : 0;
        const kiln = useProductionNativeImpostor
            ? await loadKilnImpostor(await resolveImpostorBase(treeType, { octahedral: impostorRoute.useOctahedral }), {
                tileSelectionMode: 'production-instanced-attributes',
            })
            : null;
        if (useProductionNativeImpostor) {
            builder._sdsImpostorMs = (builder._sdsImpostorMs ?? 0) + (performance.now() - _tKiln);
        }
        if (kiln?.geometry && kiln?.material) {
            builder.models.trees[treeType].traverse(child => {
                if (!child.isMesh || !child.geometry) return;
                meshDefs.push({
                    geometry: child.geometry,
                    material: child.material,
                    meshName: child.name || '(unnamed)',
                    sourceLod: 'lod0',
                    hybridRole: 'near-lod0',
                    baseOffset: builder.models.trees[treeType]?.userData?.modelBaseYOffset ?? 0,
                });
            });
            const lod1Model = builder.models.treesLod1?.[treeType] ?? null;
            if (lod1Model) {
                lod1Model.traverse(child => {
                    if (!child.isMesh || !child.geometry) return;
                    meshDefs.push({
                        geometry: child.geometry,
                        material: child.material,
                        meshName: child.name || '(unnamed)',
                        sourceLod: 'lod1',
                        hybridRole: 'mid-lod1',
                        baseOffset: lod1Model.userData?.modelBaseYOffset
                            ?? builder.models.trees[treeType]?.userData?.modelBaseYOffset
                            ?? 0,
                    });
                });
            }
            if (!builder._impostorMaterials) builder._impostorMaterials = [];
            builder._impostorMaterials.push(kiln.material);
            meshDefs.push({
                geometry: kiln.geometry,
                material: kiln.material,
                meshName: 'kiln-impostor',
                sourceLod: 'impostor',
                hybridRole: 'far-impostor',
                sidecar: kiln.sidecar,
            });
        } else {
            const sourceModel = useMobileNativeLod1
                ? (builder.models.treesLod1?.[treeType] ?? builder.models.trees[treeType])
                : builder.models.trees[treeType];
            const sourceLod = sourceModel === builder.models.treesLod1?.[treeType] ? 'lod1' : 'lod0';
            sourceModel.traverse(child => {
                if (!child.isMesh || !child.geometry) return;
                meshDefs.push({
                    geometry: child.geometry,
                    material: child.material,
                    meshName: child.name || '(unnamed)',
                    sourceLod,
                    baseOffset: sourceModel.userData?.modelBaseYOffset
                        ?? builder.models.trees[treeType]?.userData?.modelBaseYOffset
                        ?? 0,
                });
            });
        }

        // Cycle 81: consolidated compute-cull path (see treeCullModules above). One
        // appendable InstancedMesh per (type x child-mesh) across the whole scene,
        // GPU per-instance culled; streamed waves append into the same controllers
        // (Cycle 91 Phase 3) and the far-impostor controller completes the LOD
        // chain once the kiln atlas resolves (Phase 2.5 item 4).
        if (treeCullModules?.TSL) {
            const { entry, createdMeshes } = appendConsolidatedTreeInstances(
                builder, treeCullModules, treeType, instances, { meshDefs });
            for (const im of createdMeshes) instancedMeshes.push(im);
            if (entry) {
                for (const slot of entry.lod0) {
                    const im = slot.controller.mesh;
                    groups.push({
                        type: treeType,
                        chunkKey: 'consolidated',
                        meshName: slot.meshDef.meshName,
                        instances: instances.length,
                        isInstancedMesh: im.isInstancedMesh === true,
                        isInstancedMesh2: im.isInstancedMesh2 === true,
                        frustumCulled: im.frustumCulled === true,
                        sourceLod: slot.meshDef.sourceLod,
                        hybridRole: slot.meshDef.hybridRole ?? null,
                        baseOffset: slot.meshDef.baseOffset ?? null,
                        vertexCount: slot.meshDef.geometry.attributes?.position?.count ?? 0,
                    });
                }
            }
            console.log(`[TERRAIN] ${treeType}: ${instances.length} instances -> ${entry?.lod0.length ?? 0} consolidated compute-cull mesh(es)`);
            continue;
        }

        const chunkedInstances = new Map();
        for (const inst of instances) {
            const key = `${Math.floor(inst.position.x / chunkSize)}:${Math.floor(inst.position.z / chunkSize)}`;
            let chunk = chunkedInstances.get(key);
            if (!chunk) {
                chunk = [];
                chunkedInstances.set(key, chunk);
            }
            chunk.push(inst);
        }

        for (const [chunkKey, chunkInstances] of chunkedInstances) {
            const chunkCenter = computeChunkCenter(chunkInstances);
            for (const meshDef of meshDefs) {
                const impostorRuntime = meshDef.sourceLod === 'impostor'
                    ? treeImpostorRuntime.createWebGpuTreeImpostorGeometry(meshDef.geometry, chunkInstances, meshDef.sidecar)
                    : null;
                const geometry = impostorRuntime?.geometry ?? meshDef.geometry;
                const im = new THREE.InstancedMesh(geometry, meshDef.material, chunkInstances.length);
                im.userData.sharedFromGlbCache = meshDef.sourceLod !== 'impostor';
                im.userData.webgpuSharedMaterialFromImpostorCache = meshDef.sourceLod === 'impostor';
                im.userData.webgpuRuntimeGeometry = meshDef.sourceLod === 'impostor';
                im.userData.webgpuNativeInstancing = 'tree';
                im.userData.webgpuNativeChunkKey = chunkKey;

                if (meshDef.hybridRole) {
                    treeImpostorRuntime.installWebGpuTreeHybridRuntime(im, {
                        role: meshDef.hybridRole,
                        chunkCenter,
                        nearDistance: HYBRID_TREE_LOD1_SWITCH_DISTANCE,
                        switchDistance: HYBRID_TREE_IMPOSTOR_SWITCH_DISTANCE,
                    });
                    treeImpostorRuntime.syncWebGpuTreeHybridVisibility(im, getSceneManager()?.getCamera?.());
                }

                if (impostorRuntime) {
                    treeImpostorRuntime.installWebGpuTreeImpostorRuntime(im, {
                        ...impostorRuntime,
                        sidecar: meshDef.sidecar,
                        treeType,
                        chunkKey,
                    });
                    treeImpostorRuntime.syncWebGpuTreeImpostorMesh(im, getSceneManager()?.getCamera?.());
                } else {
                    chunkInstances.forEach((inst, i) => {
                        dummy.position.copy(inst.position);
                        if (Number.isFinite(inst.groundY)) {
                            const scaleScalar = Number.isFinite(inst.scaleScalar)
                                ? inst.scaleScalar
                                : (Number.isFinite(inst.scale?.y) ? inst.scale.y : 1);
                            dummy.position.y = inst.groundY + (meshDef.baseOffset ?? 0) * scaleScalar;
                        }
                        dummy.quaternion.setFromEuler(inst.rotation);
                        dummy.scale.copy(inst.scale);
                        dummy.updateMatrix();
                        im.setMatrixAt(i, dummy.matrix);
                    });
                }
                im.instanceMatrix.needsUpdate = true;
                im.computeBoundingBox?.();
                im.computeBoundingSphere?.();
                // Cycle 89: desktop tree chunks stay pinned in the render list.
                // A culled chunk re-entering the WebGPU render list re-triggers
                // GPU-process pipeline/bind-group setup (three.js #33685), which
                // the driven jitter probe measured as 70-160ms multi-frame
                // stalls while turning; pinning lifted 1%-low from 24 to 67 FPS
                // at no median cost (cycle89-validation/jitter-attribution-cull-
                // driven.json). Mobile keeps frustum culling: fewer, larger
                // chunks and a tighter GPU budget, and the repro is desktop data.
                im.frustumCulled = builder.isMobile;
                im.castShadow = !builder.isMobile && materialCastsShadow(meshDef.material);
                im.receiveShadow = true;

                builder.scene.add(im);
                instancedMeshes.push(im);
                groups.push({
                    type: treeType,
                    chunkKey,
                    meshName: meshDef.meshName,
                    instances: chunkInstances.length,
                    isInstancedMesh: im.isInstancedMesh === true,
                    isInstancedMesh2: im.isInstancedMesh2 === true,
                    frustumCulled: im.frustumCulled === true,
                    sourceLod: meshDef.sourceLod,
                    hybridRole: meshDef.hybridRole ?? null,
                    baseOffset: meshDef.baseOffset ?? null,
                    tileSelection: im.userData.webgpuNativeTreeImpostor?.selection ?? null,
                    sidecarVersion: im.userData.webgpuNativeTreeImpostor?.version ?? null,
                    sidecarLayout: im.userData.webgpuNativeTreeImpostor?.layout ?? null,
                    billboardProjection: im.userData.webgpuNativeTreeImpostor?.billboardProjection ?? null,
                    terrainGroundedPivots: im.userData.webgpuNativeTreeImpostor?.terrainGroundedPivots ?? null,
                    vertexCount: meshDef.geometry.attributes?.position?.count ?? 0,
                });
            }
        }

        console.log(`[TERRAIN] Created ${instances.length} ${treeType} native WebGPU tree instances in ${chunkedInstances.size} chunks (${meshDefs.map(def => def.sourceLod).join('+') || 'none'})`);
    }

    const nativeGroupsOk = groups.every(group => group.isInstancedMesh && !group.isInstancedMesh2 && group.vertexCount > 0);
    const impostorGroups = groups.filter(group => group.sourceLod === 'impostor');
    const nearLodGroups = groups.filter(group => group.hybridRole === 'near-lod0');
    const impostorGroupsOk = !useProductionNativeImpostor
        || (impostorGroups.length > 0
            && nearLodGroups.length > 0
            && groups.some(group => group.hybridRole === 'mid-lod1')
            && impostorGroups.every(group => group.sourceLod === 'impostor'
                && group.tileSelection === 'camera-driven-per-instance-instanced-attributes'
                && group.billboardProjection === 'cpu-world-up-locked-camera-facing'
                && group.terrainGroundedPivots === true));

    const summary = {
        applied: true,
        ok: totalTrees > 0
            && instancedMeshes.length > 0
            && nativeGroupsOk
            && impostorGroupsOk,
        source: 'THREE.InstancedMesh',
        route: 'webgpu-production-scene-body',
        lod: useProductionNativeImpostor ? impostorRoute.lod : (useMobileNativeLod1 ? 'low-tier-lod1-native' : 'lod0-only'),
        culling: builder.isMobile ? 'chunked-instanced-bounds' : 'render-list-pinned',
        chunkSize,
        impostor: {
            active: useProductionNativeImpostor,
            ok: impostorGroupsOk,
            mode: impostorRoute.runtimeMode,
            groupCount: impostorGroups.length,
            sidecarLayout: impostorRoute.sidecarLayout,
            sidecarVersion: impostorRoute.sidecarVersion,
            selection: useProductionNativeImpostor ? 'camera-driven-per-instance-instanced-attributes' : null,
            billboardProjection: useProductionNativeImpostor ? 'cpu-world-up-locked-camera-facing' : null,
            terrainGroundedPivots: useProductionNativeImpostor,
            replacesMobileLod1ByDefault: false,
            nearLod: useProductionNativeImpostor ? 'lod0' : null,
            midLod: useProductionNativeImpostor ? 'lod1' : null,
            nearDistance: useProductionNativeImpostor ? HYBRID_TREE_LOD1_SWITCH_DISTANCE : null,
            switchDistance: useProductionNativeImpostor ? HYBRID_TREE_IMPOSTOR_SWITCH_DISTANCE : null,
            rollbackQuery: impostorRoute.rollbackQuery,
        },
        productionReference: 'TerrainBuilder InstancedMesh2.addInstances',
        treeInstances: totalTrees,
        renderedInstanceMeshes: instancedMeshes.length,
        frustumCulled: groups.every(group => group.frustumCulled),
        groups,
    };
    builder.webgpuNativeTreeInstancingSummary = summary;
    builder.trees = instancedMeshes;
    console.log(`[TERRAIN] Total trees: ${totalTrees} (native WebGPU InstancedMesh route)`);

    // Cycle 101 Phase 5: all-cold islands (Rolling Hills, Open Country) arm the
    // view-dependent far-impostor band here, off the cold registry. Streamed
    // scenes (NSL) arm it from the foliageStreaming cold-coverage continuation,
    // so the `streamedZones` guard skips them to avoid a double-enable. Home
    // Field (rect) never built a consolidated registry, so size() is 0 there.
    //
    // Low tier is skipped: it keeps meshopt LOD1 island-wide with no far band,
    // exactly as the streamed NSL path does in sparse mode (the cold build's
    // consolidated source mesh is already LOD1 on mobile). The desktop octahedral
    // far path must never leak to low tier (scene-and-render.md foliage LOD
    // strategy + Cycle 101 Phase 6 acceptance).
    if (treeCullModules?.TSL && hwTier !== 'low' && !builder.sceneDef?.terrain?.streamedZones) {
        armAllColdFarImpostors(builder);
    }
    return instancedMeshes;
}

/**
 * Cycle 87 Phase 2: scene-level placement culls shared by the cold path and
 * the streamed waves. Water cull (no trees in the surf on water-aware
 * boundaries) + homestead-pen cull. Pure filter; same predicates the cold
 * path has applied since Cycles 65/66.
 *
 * @param {object} builder TerrainBuilder instance.
 * @param {Array} flatTrees TreeInstance[] from generateTrees.
 * @returns {Array} filtered TreeInstance[]
 */
export function cullTreesForScene(builder, flatTrees) {
    let out = flatTrees;
    const boundaryKind = builder.sceneDef?.boundary?.kind;
    if (boundaryKind === 'coastline' || boundaryKind === 'island') {
        out = out.filter((t) => builder._groundY(t.x, t.z) >= 0.6);
    }
    const pen = builder.sceneDef?.pen;
    if (pen?.center && pen.radius > 0) {
        const m = 4;
        const pMinX = pen.center.x - pen.radius - m, pMaxX = pen.center.x + pen.radius + m;
        const pMinZ = pen.center.z - pen.radius - m, pMaxZ = pen.center.z + pen.radius + m;
        out = out.filter((t) => !(t.x >= pMinX && t.x <= pMaxX && t.z >= pMinZ && t.z <= pMaxZ));
    }
    return out;
}

/**
 * Cycle 87 Phase 2: convert flat TreeInstance[] into the per-type renderer
 * instance lists (grounded Y via _groundY + per-model base offset). Shared by
 * the cold path and the streamed waves.
 *
 * @param {object} builder TerrainBuilder instance.
 * @param {Array} flatTrees TreeInstance[]
 * @returns {{tree1: Array, tree2: Array}}
 */
export function toTreeInstancesByType(builder, flatTrees) {
    const treeInstances = { tree1: [], tree2: [] };
    for (const t of flatTrees) {
        const treeY = builder._groundY(t.x, t.z);
        const baseOffset = builder.models.trees[t.type]?.userData?.modelBaseYOffset ?? 0;
        const placementY = treeY + baseOffset * t.scale;
        treeInstances[t.type].push({
            position: new THREE.Vector3(t.x, placementY, t.z),
            rotation: new THREE.Euler(0, t.rotationY, 0),
            scale: new THREE.Vector3(t.scale, t.scale, t.scale),
            groundY: treeY,
            scaleScalar: t.scale,
            lod0BaseOffset: baseOffset,
        });
    }
    return treeInstances;
}

/**
 * Cycle 87 Phase 2: ADDITIVE tree-mesh build for streamed waves. Appends to
 * `builder.trees` (and `builder._treeCullControllers` on the WebGPU path), so
 * clearTrees/dispose tear streamed meshes down exactly like cold ones.
 *
 * Representation matches the cold path: LOD0-only consolidated compute-cull
 * meshes on the flagship coastline WebGPU route (Cycle 81/82 validated this
 * island-wide before the Cycle 85 build-time trim; render cost was never the
 * blocker), and per-chunk plain InstancedMeshes on the WebGL fallback (no
 * LOD chain; the fallback path favors simplicity over silhouette polish).
 *
 * @param {object} builder TerrainBuilder instance.
 * @param {{tree1: Array, tree2: Array}} treeInstancesByType
 * @param {{label?: string}} [opts]
 * @returns {number} meshes created
 */
export function buildAdditiveTreeMeshes(builder, treeInstancesByType, _opts = {}) {
    const dummy = new THREE.Object3D();
    let meshCount = 0;

    const cullModules = (usesConsolidatedTreeCull(builder.sceneDef)
        && shouldUseWebGpuProductionNativeInstancing())
        ? (getWebGpuModules() || null)
        : null;
    const useComputeCull = !!cullModules?.TSL;
    if (useComputeCull && !builder._treeCullControllers) builder._treeCullControllers = [];
    const chunkSize = builder.isMobile ? 320 : 192;

    for (const [treeType, instances] of Object.entries(treeInstancesByType)) {
        if (instances.length === 0 || !builder.models.trees[treeType]) continue;

        const meshDefs = collectLod0MeshDefs(builder, treeType);

        const writeMatrix = (inst, meshDef, write) => {
            dummy.position.copy(inst.position);
            if (Number.isFinite(inst.groundY)) {
                const scaleScalar = Number.isFinite(inst.scaleScalar)
                    ? inst.scaleScalar
                    : (Number.isFinite(inst.scale?.y) ? inst.scale.y : 1);
                dummy.position.y = inst.groundY + (meshDef.baseOffset ?? 0) * scaleScalar;
            }
            dummy.quaternion.setFromEuler(inst.rotation);
            dummy.scale.copy(inst.scale);
            dummy.updateMatrix();
            write(dummy);
        };

        if (useComputeCull) {
            // Cycle 91 Phase 3: append into the consolidated per-type
            // controllers instead of minting per-wave controllers (~108 on a
            // full NSL stream -> <= 8). createdMeshes is only non-empty when
            // a type had no cold-corridor presence (controllers minted here).
            const { createdMeshes } = appendConsolidatedTreeInstances(
                builder, cullModules, treeType, instances, { meshDefs });
            for (const im of createdMeshes) {
                builder.trees.push(im);
                meshCount++;
            }
            continue;
        }

        const chunked = new Map();
        for (const inst of instances) {
            const key = `${Math.floor(inst.position.x / chunkSize)}:${Math.floor(inst.position.z / chunkSize)}`;
            let chunk = chunked.get(key);
            if (!chunk) { chunk = []; chunked.set(key, chunk); }
            chunk.push(inst);
        }
        for (const chunkInstances of chunked.values()) {
            for (const meshDef of meshDefs) {
                const im = new THREE.InstancedMesh(meshDef.geometry, meshDef.material, chunkInstances.length);
                im.userData.sharedFromGlbCache = true;
                chunkInstances.forEach((inst, i) => writeMatrix(inst, meshDef, (d) => {
                    im.setMatrixAt(i, d.matrix);
                }));
                im.instanceMatrix.needsUpdate = true;
                im.computeBoundingBox?.();
                im.computeBoundingSphere?.();
                im.frustumCulled = true;
                im.castShadow = !builder.isMobile && materialCastsShadow(meshDef.material);
                im.receiveShadow = true;
                builder.scene.add(im);
                builder.trees.push(im);
                meshCount++;
            }
        }
    }

    return meshCount;
}

/**
 * Cycle 88 Phase 2: minimal kiln artifacts for the cold impostor coverage -
 * sidecar JSON + albedo atlas only (~1.2MB per type vs ~3.6MB for the full
 * relighting triple; the static cross-billboard never reads normal/depth).
 * Nothing here is awaited on the scene-build critical path (the impostor
 * build is a detached continuation), so no fetch timeout is needed - a
 * hung or failed fetch only means the impostors never appear. No abort
 * timer either: on software-GPU hosts the main thread can block past any
 * reasonable bound and a timer would spuriously beat the arrived response
 * (the Deploy-run-27281421931 failure mode). Cached per type across scene
 * swaps, like the loadKilnImpostor cache.
 *
 * @param {string} treeType e.g. 'tree1'
 * @returns {Promise<{sidecar: object, texturePromise: Promise<THREE.Texture|null>} | null>}
 */
const _coldImpostorAtlasCache = new Map();
export async function loadColdImpostorAtlas(treeType) {
    if (_coldImpostorAtlasCache.has(treeType)) return _coldImpostorAtlasCache.get(treeType);
    const promise = (async () => {
        try {
            const base = await resolveImpostorBase(treeType);
            const res = await fetch(`${base}.json`);
            if (!res.ok) throw new Error(`sidecar HTTP ${res.status}`);
            const sidecar = await res.json();
            const texturePromise = loadImpostorTexture(base, '', THREE.SRGBColorSpace)
                .catch((err) => {
                    console.warn(`[FOLIAGE] cold impostor albedo load failed for ${treeType}:`, err);
                    return null;
                });
            return { sidecar, texturePromise };
        } catch (err) {
            console.warn(`[FOLIAGE] cold impostor sidecar load failed for ${treeType}:`, err);
            return null;
        }
    })();
    _coldImpostorAtlasCache.set(treeType, promise);
    return promise;
}

/**
 * Cycle 101 Phase 4: load the OCTAHEDRAL atlas (sidecar + albedo + capture-view
 * normal) for the consolidated far-impostor controller's view-dependent relit
 * material. Distinct from loadColdImpostorAtlas (latlon, albedo-only) which still
 * feeds the cold-coverage cross-billboard + the canopy shadow caster. Cached per
 * type across scene swaps.
 *
 * @param {string} treeType e.g. 'tree1'
 * @returns {Promise<{sidecar: object, albedoPromise: Promise<THREE.Texture|null>,
 *           normalPromise: Promise<THREE.Texture|null>} | null>}
 */
const _octImpostorAtlasCache = new Map();
export async function loadOctahedralImpostorAtlas(treeType) {
    if (_octImpostorAtlasCache.has(treeType)) return _octImpostorAtlasCache.get(treeType);
    const promise = (async () => {
        try {
            const base = await resolveImpostorBase(treeType, { octahedral: true });
            const res = await fetch(`${base}.json`);
            if (!res.ok) throw new Error(`octahedral sidecar HTTP ${res.status}`);
            const sidecar = await res.json();
            const albedoPromise = loadImpostorTexture(base, '', THREE.SRGBColorSpace)
                .catch((err) => { console.warn(`[FOLIAGE] octahedral albedo load failed for ${treeType}:`, err); return null; });
            const normalPromise = loadImpostorTexture(base, '.normal', THREE.NoColorSpace)
                .catch((err) => { console.warn(`[FOLIAGE] octahedral normal load failed for ${treeType}:`, err); return null; });
            return { sidecar, albedoPromise, normalPromise };
        } catch (err) {
            console.warn(`[FOLIAGE] octahedral sidecar load failed for ${treeType}:`, err);
            return null;
        }
    })();
    _octImpostorAtlasCache.set(treeType, promise);
    return promise;
}

/**
 * Cycle 101 Phase 4: pack the sidecar's per-tile capture directions into a
 * (tilesX*tilesY) x 1 RGBA float texture, texel i = direction for tile i
 * (row-major), Nearest-sampled. The in-shader material reads it per tile to
 * rebuild that tile's capture-view -> object normal basis.
 */
function buildImpostorDirectionsTexture(sidecar) {
    const tiles = (sidecar.tilesX ?? 8) * (sidecar.tilesY ?? 8);
    const dirs = Array.isArray(sidecar.directions) ? sidecar.directions : [];
    const data = new Float32Array(tiles * 4);
    for (let i = 0; i < tiles; i++) {
        const d = dirs[i] ?? [0, 1, 0];
        data[i * 4] = d[0];
        data[i * 4 + 1] = d[1];
        data[i * 4 + 2] = d[2];
        data[i * 4 + 3] = 1;
    }
    const tex = new THREE.DataTexture(data, tiles, 1, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    return tex;
}

/**
 * Cycle 88 Phase 2: 3-quad cross-billboard (the durable far-tree pattern)
 * with UVs into ONE tile of the kiln albedo atlas: the given azimuth column
 * at the lowest elevation row (the row gameplay cameras blend toward). Quad
 * spans the bake frustum (boundsRadius x 1.02, same math as
 * createKilnImpostorGeometry) centered on the sidecar's Y center, so the
 * tile content maps 1:1 like the camera-facing kiln quad does. UVs are
 * inset half a texel so bilinear sampling never crosses into a neighbour
 * tile (different view = hue glints).
 *
 * @param {object} sidecar Kiln sidecar JSON.
 * @param {number} azTileIndex 0..tilesX-1 azimuth column.
 * @returns {THREE.BufferGeometry}
 */
export function createColdImpostorGeometry(sidecar, azTileIndex) {
    const dx = sidecar.bbox.max[0] - sidecar.bbox.min[0];
    const dy = sidecar.bbox.max[1] - sidecar.bbox.min[1];
    const dz = sidecar.bbox.max[2] - sidecar.bbox.min[2];
    const frustumHalf = Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5 * 1.02;
    const yCenter = sidecar.yOffset ?? (sidecar.bbox.min[1] + sidecar.bbox.max[1]) * 0.5;

    const tilesX = sidecar.tilesX ?? 4;
    const tilesY = sidecar.tilesY ?? 4;
    const elRow = tilesY - 1; // lowest elevation row
    const insetU = 0.5 / (sidecar.atlasWidth ?? tilesX * 512);
    const insetV = 0.5 / (sidecar.atlasHeight ?? tilesY * 512);
    const u0 = azTileIndex / tilesX + insetU;
    const u1 = (azTileIndex + 1) / tilesX - insetU;
    const v0 = (tilesY - 1 - elRow) / tilesY + insetV;
    const v1 = (tilesY - elRow) / tilesY - insetV;

    // Cycle 92: trunk-split fix. The kiln camera centers on the bbox center,
    // so the trunk (model origin) sits off-center in every tile by its
    // projection onto the capture view's right vector (kiln dirFromAzEl gives
    // camera right = (sin a, 0, -cos a), so uT = -cx*sin(a) + cz*cos(a);
    // verified against atlas pixels, tree1 az0-3 within 0.3%). The crossed
    // planes rotate about the instance origin, so without compensation each
    // plane draws the trunk offset a different direction and the tree reads
    // as a split trunk. Shift every quad in-plane by -uT so the trunk column
    // lands on the rotation axis (and on the LOD0 trunk position).
    const tileAz = sidecar.azimuths?.[azTileIndex] ?? (azTileIndex * Math.PI * 2) / tilesX;
    const cx = (sidecar.bbox.min[0] + sidecar.bbox.max[0]) * 0.5;
    const cz = (sidecar.bbox.min[2] + sidecar.bbox.max[2]) * 0.5;
    const trunkU = -cx * Math.sin(tileAz) + cz * Math.cos(tileAz);

    const yBottom = yCenter - frustumHalf;
    const yTop = yCenter + frustumHalf;
    const positions = [];
    const uvs = [];
    for (let q = 0; q < 3; q++) {
        const angle = (q * Math.PI) / 3;
        const rx = Math.cos(angle);
        const rz = Math.sin(angle);
        const ax = rx * frustumHalf;
        const az = rz * frustumHalf;
        const sx = -trunkU * rx;
        const sz = -trunkU * rz;
        positions.push(
            -ax + sx, yBottom, -az + sz, ax + sx, yBottom, az + sz, ax + sx, yTop, az + sz,
            -ax + sx, yBottom, -az + sz, ax + sx, yTop, az + sz, -ax + sx, yTop, -az + sz
        );
        uvs.push(
            u0, v0, u1, v0, u1, v1,
            u0, v0, u1, v1, u0, v1
        );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
}

/**
 * Cycle 88 Phase 2: build the static impostor coverage meshes for the cold
 * path. Instances batch per (treeType, azimuth tile) - at most tilesX small
 * InstancedMeshes per type, 18 verts per instance - appended wave-by-wave so
 * every (batch, wave) pair is one contiguous index range; the returned
 * `ranges` map lets a streamed wave retire its zone's impostors by writing
 * zero-scale matrices (Q2 decision) without any rebuild.
 *
 * Materials start with `map: null` and meshes invisible; the caller binds
 * the albedo texture whenever its fetch resolves, so a slow network delays
 * impostor VISIBILITY, never the scene build. Meshes ride `builder.trees`
 * (clearTrees removes + disposes owned geometry/material; map is nulled
 * there so the cached atlas texture survives the swap) and the materials
 * ride `builder._impostorMaterials` so setImpostorTint's cross-billboard
 * fallback path tints them with time-of-day.
 *
 * @param {object} builder TerrainBuilder instance.
 * @param {Array<{name: string, trees: Array}>} waves scene-culled flat trees per wave.
 * @param {Record<string, {sidecar: object} | null>} atlasByType
 * @returns {{meshes: THREE.InstancedMesh[], materialsByType: Record<string, THREE.Material>,
 *            ranges: Map<string, Array<{mesh: THREE.InstancedMesh, start: number, count: number}>>,
 *            totalInstances: number}}
 */
export function buildColdImpostorMeshes(builder, waves, atlasByType) {
    const dummyPos = new THREE.Vector3();
    const dummyQuat = new THREE.Quaternion();
    const dummyScale = new THREE.Vector3();
    const dummyEuler = new THREE.Euler();
    const matrix = new THREE.Matrix4();

    // Partition: batch per (type, azTile); each batch keeps wave-ordered
    // entries so ranges stay contiguous.
    const batches = new Map();
    for (const wave of waves) {
        for (const t of wave.trees) {
            const atlas = atlasByType[t.type];
            if (!atlas?.sidecar) continue;
            const tilesX = atlas.sidecar.tilesX ?? 4;
            // Stable per-instance azimuth-tile pick from the scatter's own
            // rotation - deterministic, no extra RNG stream.
            const azTile = Math.floor(((t.rotationY % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI) * tilesX) % tilesX;
            const key = `${t.type}:${azTile}`;
            let batch = batches.get(key);
            if (!batch) {
                batch = { type: t.type, azTile, entries: [] };
                batches.set(key, batch);
            }
            batch.entries.push({ tree: t, waveName: wave.name });
        }
    }

    const meshes = [];
    const materialsByType = {};
    const ranges = new Map();
    let totalInstances = 0;

    for (const batch of batches.values()) {
        const atlas = atlasByType[batch.type];
        if (!materialsByType[batch.type]) {
            const mat = new THREE.MeshBasicMaterial({
                map: null,
                transparent: false,
                alphaTest: 0.4,
                side: THREE.DoubleSide,
                depthWrite: true,
                fog: true,
            });
            materialsByType[batch.type] = mat;
            if (!builder._impostorMaterials) builder._impostorMaterials = [];
            builder._impostorMaterials.push(mat);
        }
        const geometry = createColdImpostorGeometry(atlas.sidecar, batch.azTile);
        const mesh = new THREE.InstancedMesh(geometry, materialsByType[batch.type], batch.entries.length);
        let rangeStart = 0;
        let rangeWave = null;
        const flushRange = (end) => {
            if (rangeWave === null || end === rangeStart) return;
            let list = ranges.get(rangeWave);
            if (!list) { list = []; ranges.set(rangeWave, list); }
            list.push({ mesh, start: rangeStart, count: end - rangeStart });
        };
        batch.entries.forEach(({ tree, waveName }, i) => {
            if (waveName !== rangeWave) {
                flushRange(i);
                rangeStart = i;
                rangeWave = waveName;
            }
            dummyPos.set(tree.x, builder._groundY(tree.x, tree.z), tree.z);
            dummyQuat.setFromEuler(dummyEuler.set(0, tree.rotationY, 0));
            dummyScale.setScalar(tree.scale);
            matrix.compose(dummyPos, dummyQuat, dummyScale);
            mesh.setMatrixAt(i, matrix);
        });
        flushRange(batch.entries.length);
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingBox?.();
        mesh.computeBoundingSphere?.();
        // frustumCulled=false: cold coverage is the whole-island silhouette,
        // batched per (type, azTile) across every wave. A single per-batch
        // bounding sphere spans the island, so on a far-offset scene
        // (Newsheepdogland's mass sits ~1.7km off origin) the all-or-nothing
        // Frustum.intersectsSphere test rejects the entire batch the moment the
        // homestead camera faces away from the centroid - every impostor blinks
        // out at once. The consolidated trees (treeComputeCull) and grass
        // (grassComputeCull) already cull per-instance for exactly this reason;
        // these billboards are cheap (18 verts/instance) and transient (retired
        // per wave), so a full-island depth/color pass is trivial.
        mesh.frustumCulled = false;
        mesh.castShadow = false; // durable far-impostor rule
        mesh.receiveShadow = false;
        mesh.visible = false; // shown when the albedo texture binds
        mesh.userData.foliageColdImpostor = { type: batch.type, azTile: batch.azTile };
        builder.scene.add(mesh);
        builder.trees.push(mesh);
        meshes.push(mesh);
        totalInstances += batch.entries.length;
    }

    return { meshes, materialsByType, ranges, totalInstances };
}

/**
 * Cycle 88 Phase 3: retire one wave's cold impostor instances after the
 * wave's LOD0 meshes land. Zero-scale matrices collapse the quads to
 * degenerate triangles - no rebuild, one small instanceMatrix upload per
 * touched mesh (Q2 decision).
 *
 * @param {object} builder TerrainBuilder instance.
 * @param {string} waveName
 * @returns {number} instances retired
 */
const ZERO_MATRIX = new THREE.Matrix4().set(
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 1,
);
export function retireColdImpostorWave(builder, waveName) {
    const coverage = builder._foliageColdCoverage;
    if (!coverage) return 0;
    // Record the retirement even when the impostor meshes don't exist yet
    // (the detached impostor build is still in flight on slow hosts): the
    // build skips retired waves, so a landed LOD0 zone never gains a late
    // double representation.
    coverage.retiredWaves?.add(waveName);
    const rangeList = coverage.ranges?.get(waveName);
    if (!rangeList) return 0;
    let retired = 0;
    for (const { mesh, start, count } of rangeList) {
        for (let i = 0; i < count; i++) mesh.setMatrixAt(start + i, ZERO_MATRIX);
        mesh.instanceMatrix.needsUpdate = true;
        retired += count;
    }
    return retired;
}

/**
 * @param {object} builder TerrainBuilder instance.
 * @param {Array | null} [competitivePastures]
 * @returns {Promise<Array>} Array of InstancedMesh2 created.
 */
export async function placeTrees(builder, competitivePastures = null) {
    if (!builder.modelsLoaded) {
        console.warn('Models not loaded yet. Loading models...');
        await builder.loadModels();
    }

    // Cycle 6 Phase 1: placement lives in shared/TreePlacement.js so client +
    // Worker compute identical positions from the same seed. Y math (_groundY +
    // per-model base offset) stays here on the client because it's a renderer
    // concern.
    const seed = builder.sceneDef?.terrain?.seed ?? 0;
    // Cycle 45 Phase 3: scenes with a baked placement manifest skip the
    // ~489ms scatter and load pre-scattered positions instead, then re-reject
    // against this load's rocks (rocks are Math.random, so they can't bake in).
    // Competitive mode re-scatters with its pastures, so it always takes the
    // runtime path; a failed manifest fetch falls back to the scatter too.
    const manifestUrl = builder.sceneDef?.placementManifest;
    let flatTrees;
    if (manifestUrl && !competitivePastures) {
        try {
            // Lazy-loaded: the manifest path is optional and scene-gated, so it
            // code-splits out of the main chunk (only field declares one today).
            const { loadPlacementTrees, rejectTreesOnRocks } =
                await import('./placementManifest.js');
            const baked = await loadPlacementTrees(manifestUrl);
            flatTrees = rejectTreesOnRocks(baked, builder.rockPositions);
        } catch (err) {
            console.warn(`[TERRAIN] Placement manifest load failed; using runtime scatter:`, err);
        }
    }
    if (!flatTrees) {
        flatTrees = generateTrees(builder.sceneDef, mulberry32(seed), {
            competitivePastures,
            rockPositions: builder.rockPositions,
        });
    }

    // Cycle 65: no trees in the water; Cycle 66 P2/P3: no trees inside the
    // homestead pen. Both culls extracted to cullTreesForScene (Cycle 87
    // Phase 2) so streamed waves apply the identical predicates.
    flatTrees = cullTreesForScene(builder, flatTrees);

    builder.treeInstances = flatTrees;

    // Grounded-Y conversion extracted to toTreeInstancesByType (Cycle 87
    // Phase 2); uses _groundY (mirrors terrain falloff) instead of the raw
    // heightfield sample, and compensates for the GLB's origin offset.
    const treeInstances = toTreeInstancesByType(builder, flatTrees);
    builder.webgpuTreeGroundingSample = Object.entries(treeInstances)
        .flatMap(([type, instances]) => instances.slice(0, 6).map((inst) => ({
            type,
            x: +inst.position.x.toFixed(3),
            z: +inst.position.z.toFixed(3),
            groundY: +inst.groundY.toFixed(3),
            placementY: +inst.position.y.toFixed(3),
            scale: +inst.scaleScalar.toFixed(3),
            lod0BaseOffset: +inst.lod0BaseOffset.toFixed(3),
            lod1BaseOffset: +(builder.models.treesLod1?.[type]?.userData?.modelBaseYOffset
                ?? inst.lod0BaseOffset).toFixed(3),
        })));

    // Cycle 16 Phase 1+2: per-instance LOD chain via InstancedMesh2.addLOD.
    const renderer = getSceneManager()?.getRenderer();
    const instancedMeshes = [];

    // Cycle 25 Phase B: hardware tier gates the LOD1 mid-band on the
    // tree InstancedMeshes. Resolved once per pass since tier doesn't
    // change at runtime.
    const hwTier = getSceneManager()?.getTier?.() ?? (builder.isMobile ? 'low' : 'med');

    // Cycle 17 follow-up: reset the per-swap impostor-material list so
    // setImpostorTint() doesn't hold stale refs from a prior scene's
    // billboards.
    builder._impostorMaterials = [];

    // Cycle 17 Phase 1 probe hook (gated on `?probeRender=1`).
    const probe = builder._probeRender ? (window.__sds = window.__sds || {}, window.__sds.probe = window.__sds.probe || { trees: {} }) : null;
    if (probe) {
        probe.trees.rendererAtCreate = !!renderer;
        probe.trees.isMobile = !!builder.isMobile;
        probe.trees.byType = {};
    }

    if (shouldUseWebGpuProductionNativeInstancing()) {
        return createNativeTreeInstancedMeshes(builder, treeInstances);
    }
    builder.webgpuNativeTreeInstancingSummary = { applied: false, reason: 'flag-disabled' };

    // Cache baked cross-billboard impostors per tree type. Survives dispose()
    // like the models cache. Cycle 11 Phase 1 A8 finding: re-baking on each
    // scene swap leaks one WebGLRenderTarget per tree species per swap.
    if (!builder._bakeImpostorCache) builder._bakeImpostorCache = new Map();

    // Cycle 19 follow-up: build trunk LOD2 empty geometry by cloning the
    // trunk's own attribute schema with zero-length buffers. The previous
    // shared 3-vert empty triggered ANGLE "Vertex buffer is not big enough
    // for the draw call" warnings.
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
    if (!builder._lod2EmptyGeoCache) builder._lod2EmptyGeoCache = new WeakMap();

    // Cycle 20 Phase 2: pre-load offline-baked Kiln impostors in parallel
    // for every tree type that's actually about to be instanced.
    const kilnImpostorByType = new Map();
    const kilnTreeTypes = Object.entries(treeInstances)
        .filter(([type, list]) => list.length > 0 && builder.models.trees[type])
        .map(([type]) => type);
    const _tKilnPreload = performance.now();
    const kilnLoadResults = await Promise.all(
        kilnTreeTypes.map(async (type) => loadKilnImpostor(await resolveImpostorBase(type)))
    );
    builder._sdsImpostorMs = (builder._sdsImpostorMs ?? 0) + (performance.now() - _tKilnPreload);
    for (let i = 0; i < kilnTreeTypes.length; i++) {
        const triple = kilnLoadResults[i];
        if (!triple) continue;
        kilnImpostorByType.set(kilnTreeTypes[i], triple);
        // Cycle 25 Phase D: uMatchBoost calibration LUT removed.
        // Cycle 26 v2.0.5: AtmosphericDesatPatch deleted.
    }

    Object.entries(treeInstances).forEach(([treeType, instances]) => {
        if (instances.length === 0 || !builder.models.trees[treeType]) return;

        const lod0Model = builder.models.trees[treeType];
        const lod1Model = builder.models.treesLod1?.[treeType] ?? null;

        // Index LOD0 + LOD1 children by mesh name so trunk pairs with trunk
        // and leaves with leaves.
        const lod1ChildByName = new Map();
        if (lod1Model) {
            lod1Model.traverse(c => { if (c.isMesh && c.geometry) lod1ChildByName.set(c.name, c); });
        }

        // Cycle 20 Phase 2: prefer the offline-baked Kiln impostor. Fall back
        // to the cross-billboard if the kiln load failed.
        const kiln = kilnImpostorByType.get(treeType) ?? null;

        let impostor = kiln ? null : builder._bakeImpostorCache.get(treeType);
        const impostorWasCached = !!impostor;
        if (!kiln && !impostor && renderer) {
            const _tBake = performance.now();
            impostor = bakeTreeImpostor(builder, lod0Model, renderer);
            builder._sdsImpostorMs = (builder._sdsImpostorMs ?? 0) + (performance.now() - _tBake);
            if (impostor) builder._bakeImpostorCache.set(treeType, impostor);
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
            // Cycle 20 Phase 2 primary path. Geometry + material were built
            // once by loadKilnImpostor and cached.
            billboardGeo = kiln.geometry;
            billboardMat = kiln.material;
        } else if (impostor) {
            // Cross-billboard fallback (Cycle 16/17). `transparent: false`
            // puts the billboard in the OPAQUE render queue with a hard alpha
            // cutoff — the transparent queue's alpha-blend interaction with
            // mipmapped silhouettes produced a light halo around tree edges.
            billboardGeo = createCrossBillboardGeometry(impostor.width, impostor.bboxMinY, impostor.bboxMaxY);
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
            // Tracked on builder._impostorMaterials so per-frame setImpostorTint()
            // can update each material's color to follow sun direction + ToD.
            if (!builder._impostorMaterials) builder._impostorMaterials = [];
            builder._impostorMaterials.push(billboardMat);
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
            // Cycle 12 Phase 1 A8: this InstancedMesh shares its geometry +
            // material with the cached GLB model. Tag so clearTrees() removes-
            // from-scene only — disposing would invalidate the GLB cache and
            // force a texture re-upload on the next swap.
            im.userData.sharedFromGlbCache = true;

            // Cycle 22 Phase A: LOD1 80m band with meshopt-baked geometry.
            // Cycle 25 Phase B: tier-gated. Desktop med/high drops the mid-
            // band entirely so the LOD0 silhouette holds out to 200m where
            // the impostor takes over. Mobile-low keeps the chain because
            // perf budget matters more than silhouette fidelity.
            const tierPreset = TIER_PRESETS[hwTier] ?? TIER_PRESETS.med;
            const usesLod1 = tierPreset.usesLod1ForFoliage;
            if (usesLod1 && lod1Child?.geometry && lod1Child?.material) {
                im.addLOD(lod1Child.geometry, lod1Child.material, 80);
            }

            if (billboardGeo && billboardMat) {
                if (isLeavesMesh) {
                    // Cycle 21 Phase 5: pushed LOD swap 100m → 200m so the
                    // foreground/midground stays geometric (LOD0).
                    im.addLOD(billboardGeo, billboardMat, 200);
                    // Cycle 21 Phase 5 fix: explicitly route the SHADOW render
                    // pass through LOD0 ONLY — never through the LOD2 impostor
                    // billboard. The billboard vertex shader uses cameraPosition
                    // for camera-facing pose; during the shadow pass
                    // cameraPosition is the LIGHT's position, so the billboard
                    // ends up facing the sun and its shadow doesn't align with
                    // the player camera's view. Setting shadowRender pinned to
                    // LOD0 means every instance renders LOD0 geometry into the
                    // shadow map — leaf-shaped shadow that matches the player's
                    // view. Slight perf cost but shadow rendering is depth-only
                    // + no fragment shader, so negligible at our 200-500-tree
                    // scale.
                    im.LODinfo.shadowRender = {
                        levels: [{ distance: 0, hysteresis: 0, object: im }],
                        count: [0],
                    };
                } else {
                    let trunkLod2 = builder._lod2EmptyGeoCache.get(child.geometry);
                    if (!trunkLod2) {
                        trunkLod2 = makeMatchingEmptyGeo(child.geometry);
                        builder._lod2EmptyGeoCache.set(child.geometry, trunkLod2);
                    }
                    // Cycle 21 Phase 5: same 200m distance as leaves.
                    im.addLOD(trunkLod2, child.material, 200);
                }
            }

            // InstancedMesh2 entities expose position/quaternion/scale.
            im.addInstances(instances.length, (obj, i) => {
                const inst = instances[i];
                obj.position.copy(inst.position);
                obj.quaternion.setFromEuler(inst.rotation);
                obj.scale.copy(inst.scale);
            });

            // Cycle 19 follow-up: build a BVH so per-instance frustum culling
            // + LOD distance checks short-circuit by tree-chunk instead of
            // scanning every instance. Trees are static post-placement (no
            // per-frame matrix updates), so margin: 0 is fine.
            im.computeBVH({ margin: 0 });

            im.castShadow = !builder.isMobile;
            im.receiveShadow = true;

            builder.scene.add(im);
            instancedMeshes.push(im);
        });

        const lodTag = billboardGeo ? 'LOD0+impostor' : 'LOD0-only';
        console.log(`[TERRAIN] Created ${instances.length} ${treeType} mesh instances (${lodTag})`);
    });

    builder.trees = instancedMeshes;
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
 * @param {object} builder
 * @param {THREE.Object3D} model
 * @param {THREE.WebGLRenderer} renderer
 * @returns {{texture: THREE.Texture, width: number, bboxMinY: number, bboxMaxY: number} | null}
 */
export function bakeTreeImpostor(builder, model, renderer) {
    const bakeScene = new THREE.Scene();
    bakeScene.background = null;
    // Cycle 17 Phase 2: dropped ambient 0.55 → 0.30 + dirLight 0.85 → 0.55.
    // Prior values washed brown bark up to a tan/cream tone that read as
    // "white bark" silhouette against grass at LOD2 distance.
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
    if (builder._probeRender && typeof window !== 'undefined') {
        window.__sds = window.__sds || {};
        window.__sds.probe = window.__sds.probe || { trees: {} };
        window.__sds.probe.lastBakeBox = { x: size.x, y: size.y, z: size.z, minY: box.min.y, maxY: box.max.y };
    }

    // Pad the camera frustum slightly so the tree silhouette doesn't
    // clip against the texture edges.
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
 * stays full-width regardless of camera angle.
 *
 * @param {number} width
 * @param {number} y0  Lower Y in unit scale (matches model bbox.min.y)
 * @param {number} y1  Upper Y in unit scale (matches model bbox.max.y)
 * @returns {THREE.BufferGeometry}
 */
export function createCrossBillboardGeometry(width, y0, y1) {
    const halfW = width / 2;
    const positions = [];
    const uvs = [];
    // 3 planes at 0°, 60°, 120°. Each plane is 2 triangles (6 verts).
    for (let q = 0; q < 3; q++) {
        const angle = (q * Math.PI) / 3;
        const ax = Math.cos(angle) * halfW;
        const az = Math.sin(angle) * halfW;
        positions.push(
            -ax, y0, -az, ax, y0, az, ax, y1, az,
            -ax, y0, -az, ax, y1, az, -ax, y1, -az
        );
        uvs.push(
            0, 0, 1, 0, 1, 1,
            0, 0, 1, 1, 0, 1
        );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return geo;
}
