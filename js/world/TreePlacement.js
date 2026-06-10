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
import { loadKilnImpostor } from '../kiln-impostor-material.js';
import { getSceneManager } from '../GameBridge.js';
import { createTreeComputeCull } from './treeComputeCull.js';
import { getWebGpuModules } from './webgpuModules.js';
import { TIER_PRESETS } from '../HardwareTier.js';
import { shouldUseWebGpuProductionNativeInstancing } from '../rendering/webgpuRuntimeMode.js';
import { resolveImpostorBase } from './objectImpostorManifest.js';

const HYBRID_TREE_LOD1_SWITCH_DISTANCE = 56;
const HYBRID_TREE_IMPOSTOR_SWITCH_DISTANCE = 144;
let treeImpostorRuntimePromise = null;

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
    const treeCullModules = (builder.sceneDef?.boundary?.kind === 'coastline' && !useProductionNativeImpostor)
        ? (getWebGpuModules() || null)
        : null;
    if (treeCullModules?.TSL) {
        builder._treeCullControllers = []; // fresh per build; prior controllers disposed by clearTrees
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
        // InstancedMesh per meshDef across the whole scene, GPU per-instance culled,
        // bypassing the per-chunk fan-out (no hybrid impostor LOD on this path to keep).
        if (treeCullModules?.TSL) {
            const cullDummy = new THREE.Object3D();
            for (const meshDef of meshDefs) {
                const matrices = new Float32Array(instances.length * 16);
                const offsets = new Float32Array(instances.length * 3);
                instances.forEach((inst, i) => {
                    cullDummy.position.copy(inst.position);
                    if (Number.isFinite(inst.groundY)) {
                        const scaleScalar = Number.isFinite(inst.scaleScalar)
                            ? inst.scaleScalar
                            : (Number.isFinite(inst.scale?.y) ? inst.scale.y : 1);
                        cullDummy.position.y = inst.groundY + (meshDef.baseOffset ?? 0) * scaleScalar;
                    }
                    cullDummy.quaternion.setFromEuler(inst.rotation);
                    cullDummy.scale.copy(inst.scale);
                    cullDummy.updateMatrix();
                    cullDummy.matrix.toArray(matrices, i * 16);
                    offsets[i * 3] = cullDummy.position.x;
                    offsets[i * 3 + 1] = cullDummy.position.y;
                    offsets[i * 3 + 2] = cullDummy.position.z;
                });
                const controller = createTreeComputeCull(treeCullModules, {
                    geometry: meshDef.geometry,
                    material: meshDef.material,
                    matrices,
                    offsets,
                    count: instances.length,
                    castShadow: !builder.isMobile,
                });
                const im = controller.mesh;
                // clearTrees removes it from the scene; the controller owns the cloned
                // geometry disposal and the material is shared -> skip both in clearTrees.
                im.userData.sharedFromGlbCache = true;
                im.userData.webgpuNativeInstancing = 'tree';
                im.userData.webgpuNativeChunkKey = 'consolidated';
                im.userData.webgpuTreeType = treeType;
                builder.scene.add(im);
                instancedMeshes.push(im);
                builder._treeCullControllers.push(controller);
                groups.push({
                    type: treeType,
                    chunkKey: 'consolidated',
                    meshName: meshDef.meshName,
                    instances: instances.length,
                    isInstancedMesh: im.isInstancedMesh === true,
                    isInstancedMesh2: im.isInstancedMesh2 === true,
                    frustumCulled: im.frustumCulled === true,
                    sourceLod: meshDef.sourceLod,
                    hybridRole: meshDef.hybridRole ?? null,
                    baseOffset: meshDef.baseOffset ?? null,
                    vertexCount: meshDef.geometry.attributes?.position?.count ?? 0,
                });
            }
            console.log(`[TERRAIN] ${treeType}: ${instances.length} instances -> ${meshDefs.length} consolidated compute-cull mesh(es)`);
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
                im.frustumCulled = true;
                im.castShadow = !builder.isMobile;
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
        culling: 'chunked-instanced-bounds',
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
export function buildAdditiveTreeMeshes(builder, treeInstancesByType, opts = {}) {
    const label = opts.label ?? 'streamed';
    const dummy = new THREE.Object3D();
    let meshCount = 0;

    const cullModules = (builder.sceneDef?.boundary?.kind === 'coastline'
        && shouldUseWebGpuProductionNativeInstancing())
        ? (getWebGpuModules() || null)
        : null;
    const useComputeCull = !!cullModules?.TSL;
    if (useComputeCull && !builder._treeCullControllers) builder._treeCullControllers = [];
    const chunkSize = builder.isMobile ? 320 : 192;

    for (const [treeType, instances] of Object.entries(treeInstancesByType)) {
        if (instances.length === 0 || !builder.models.trees[treeType]) continue;

        const meshDefs = [];
        builder.models.trees[treeType].traverse(child => {
            if (!child.isMesh || !child.geometry) return;
            meshDefs.push({
                geometry: child.geometry,
                material: child.material,
                baseOffset: builder.models.trees[treeType]?.userData?.modelBaseYOffset ?? 0,
            });
        });

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
            for (const meshDef of meshDefs) {
                const matrices = new Float32Array(instances.length * 16);
                const offsets = new Float32Array(instances.length * 3);
                instances.forEach((inst, i) => writeMatrix(inst, meshDef, (d) => {
                    d.matrix.toArray(matrices, i * 16);
                    offsets[i * 3] = d.position.x;
                    offsets[i * 3 + 1] = d.position.y;
                    offsets[i * 3 + 2] = d.position.z;
                }));
                const controller = createTreeComputeCull(cullModules, {
                    geometry: meshDef.geometry,
                    material: meshDef.material,
                    matrices,
                    offsets,
                    count: instances.length,
                    castShadow: !builder.isMobile,
                });
                const im = controller.mesh;
                im.userData.sharedFromGlbCache = true;
                im.userData.webgpuNativeInstancing = 'tree';
                im.userData.webgpuNativeChunkKey = `consolidated-${label}`;
                im.userData.webgpuTreeType = treeType;
                builder.scene.add(im);
                builder.trees.push(im);
                builder._treeCullControllers.push(controller);
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
                im.castShadow = !builder.isMobile;
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
