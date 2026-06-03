// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { applyKonveyorTreeRockMaterials } from '../world/konveyorMaterialAdapter.js';
import {
    createKonveyorNativeRockInstancingPreview,
    createKonveyorNativeTreeInstancingPreview,
} from '../world/konveyorNativeInstancingAdapter.js';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/v1/decoders/';

export const RUNTIME_GLB_RENDER_PREVIEW_ASSETS = [
    {
        key: 'tree1-lod0',
        group: 'tree-lod0',
        role: 'tree',
        path: 'assets/models/trees/tree1.glb',
        targetHeight: 0.52,
        position: [-2.38, -0.88, 0.34],
        rotationY: 0.35,
    },
    {
        key: 'tree2-lod0',
        group: 'tree-lod0',
        role: 'tree',
        path: 'assets/models/trees/tree2.glb',
        targetHeight: 0.52,
        position: [-2.02, -0.88, 0.34],
        rotationY: -0.2,
    },
    {
        key: 'tree1-lod1',
        group: 'tree-lod1',
        role: 'tree',
        path: 'assets/models/trees/tree1_lod1.glb',
        targetHeight: 0.44,
        position: [-1.66, -0.88, 0.34],
        rotationY: 0.2,
    },
    {
        key: 'tree2-lod1',
        group: 'tree-lod1',
        role: 'tree',
        path: 'assets/models/trees/tree2_lod1.glb',
        targetHeight: 0.44,
        position: [-1.34, -0.88, 0.34],
        rotationY: -0.35,
    },
    {
        key: 'rock1-lod0',
        group: 'rock-lod0',
        role: 'rock',
        path: 'assets/models/rocks/rock1.glb',
        targetHeight: 0.34,
        position: [1.05, -0.84, 0.32],
        rotationY: -0.25,
    },
    {
        key: 'rock2-lod0',
        group: 'rock-lod0',
        role: 'rock',
        path: 'assets/models/rocks/rock2.glb',
        targetHeight: 0.34,
        position: [1.45, -0.84, 0.32],
        rotationY: 0.25,
    },
    {
        key: 'rock3-lod0',
        group: 'rock-lod0',
        role: 'rock',
        path: 'assets/models/rocks/rock3.glb',
        targetHeight: 0.34,
        position: [1.85, -0.84, 0.32],
        rotationY: 0.65,
    },
];

async function loadGltfLoaderModules() {
    return { GLTFLoader, DRACOLoader, MeshoptDecoder };
}

function createGltfLoader({ GLTFLoader, DRACOLoader, MeshoptDecoder }) {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(dracoLoader);
    loader.setMeshoptDecoder(MeshoptDecoder);
    return { loader, dracoLoader };
}

function loadScene(loader, path) {
    return new Promise((resolve, reject) => {
        loader.load(
            path,
            (gltf) => resolve(gltf.scene),
            undefined,
            (err) => reject(err)
        );
    });
}

function fitAsset(asset, root, { Box3, Vector3 }) {
    const initialBox = new Box3().setFromObject(root);
    const initialSize = initialBox.getSize(new Vector3());
    const largestAxis = Math.max(initialSize.x, initialSize.y, initialSize.z, 0.001);
    const scale = asset.targetHeight / largestAxis;
    root.scale.multiplyScalar(scale);
    root.rotation.y = asset.rotationY;

    const scaledBox = new Box3().setFromObject(root);
    const center = scaledBox.getCenter(new Vector3());
    root.position.sub(center);

    const centeredBox = new Box3().setFromObject(root);
    root.position.y += asset.position[1] - centeredBox.min.y;
    root.position.x += asset.position[0];
    root.position.z += asset.position[2];

    const finalBox = new Box3().setFromObject(root);
    const finalSize = finalBox.getSize(new Vector3());
    return {
        scale: Number(scale.toFixed(4)),
        width: Number(finalSize.x.toFixed(4)),
        height: Number(finalSize.y.toFixed(4)),
        depth: Number(finalSize.z.toFixed(4)),
    };
}

function createPlacementExtents(samples) {
    const xs = samples.map((sample) => sample.production.x);
    const zs = samples.map((sample) => sample.production.z);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minZ: Math.min(...zs),
        maxZ: Math.max(...zs),
    };
}

function projectPlacementSample(sample, extents) {
    const lerp = (value, min, max, outMin, outMax) => {
        const span = Math.max(max - min, 0.001);
        return outMin + ((value - min) / span) * (outMax - outMin);
    };
    const productionScale = sample.production.scale;
    return {
        x: lerp(sample.production.x, extents.minX, extents.maxX, -2.35, 2.35),
        y: -0.68,
        z: lerp(sample.production.z, extents.minZ, extents.maxZ, 0.72, 1.02),
        scaleMultiplier: Math.min(0.52, Math.max(0.24, productionScale / 62)),
        rotationY: sample.production.rotationY,
    };
}

function projectRockPlacementSample(sample, extents) {
    const lerp = (value, min, max, outMin, outMax) => {
        const span = Math.max(max - min, 0.001);
        return outMin + ((value - min) / span) * (outMax - outMin);
    };
    const productionScale = sample.production.scale;
    const scale = Math.min(0.24, Math.max(0.12, productionScale / 110));
    return {
        x: lerp(sample.production.x, extents.minX, extents.maxX, 0.72, 1.68),
        y: -0.7,
        z: lerp(sample.production.z, extents.minZ, extents.maxZ, 0.42, 0.92),
        rotationX: sample.production.rotationX,
        rotationY: sample.production.rotationY,
        rotationZ: sample.production.rotationZ,
        scaleX: scale,
        scaleY: scale * sample.production.scaleY,
        scaleZ: scale * sample.production.scaleZ,
    };
}

function placeCloneOnGround(clone, display, { Box3, Vector3 }) {
    clone.position.set(display.x, display.y, display.z);
    clone.rotation.y += display.rotationY;
    clone.scale.multiplyScalar(display.scaleMultiplier);

    const box = new Box3().setFromObject(clone);
    clone.position.y += display.y - box.min.y;
    const finalBox = new Box3().setFromObject(clone);
    const finalSize = finalBox.getSize(new Vector3());
    return {
        x: Number(clone.position.x.toFixed(3)),
        y: Number(clone.position.y.toFixed(3)),
        z: Number(clone.position.z.toFixed(3)),
        scaleMultiplier: Number(display.scaleMultiplier.toFixed(4)),
        width: Number(finalSize.x.toFixed(4)),
        height: Number(finalSize.y.toFixed(4)),
        depth: Number(finalSize.z.toFixed(4)),
    };
}

function createProductionInstancingPreview({ scene, rootsByAsset, plan, extents, three }) {
    return createKonveyorNativeTreeInstancingPreview({
        scene,
        rootsByAsset,
        plan,
        createDisplayTransform: (sample) => projectPlacementSample(sample, extents),
        three,
    });
}

async function createDiagnosticRockPlacementPreview({ scene, rootsByAsset, three }) {
    const { createDiagnosticRockPlacementPlan } = await import('./webgpuRockPlacementPlan.js');
    const plan = createDiagnosticRockPlacementPlan();
    if (plan.samples.length === 0) {
        return {
            roots: [],
            summary: {
                ...plan,
                ok: false,
            },
            instancing: {
                ok: false,
                reason: 'no-rock-placement-samples',
            },
        };
    }

    const extents = createPlacementExtents(plan.samples);
    const instancing = createKonveyorNativeRockInstancingPreview({
        scene,
        rootsByAsset,
        plan,
        createDisplayTransform: (sample) => projectRockPlacementSample(sample, extents),
        three,
    });

    return {
        roots: instancing.roots,
        summary: {
            ...plan,
            ok: plan.ok && instancing.summary.ok,
        },
        instancing: instancing.summary,
    };
}

async function createProductionPlacementPreview({ scene, rootsByAsset, three }) {
    const { createProductionTreePlacementPlan } = await import('./webgpuProductionPlacementPlan.js');
    const plan = createProductionTreePlacementPlan();
    if (plan.samples.length === 0) {
        return {
            roots: [],
            summary: {
                ...plan,
                ok: false,
                renderedTrees: 0,
                rendered: [],
            },
            instancing: {
                ok: false,
                reason: 'no-placement-samples',
            },
        };
    }

    const extents = createPlacementExtents(plan.samples);
    const roots = [];
    const rendered = [];
    const instancing = createProductionInstancingPreview({ scene, rootsByAsset, plan, extents, three });

    for (const sample of plan.samples) {
        const sourceRoot = rootsByAsset.get(`tree-lod0:${sample.type}-lod0`);
        if (!sourceRoot) continue;

        const clone = sourceRoot.clone(true);
        const display = projectPlacementSample(sample, extents);
        const bounds = placeCloneOnGround(clone, display, three);
        scene.add(clone);
        roots.push(clone);
        rendered.push({
            ...sample,
            display: {
                x: Number(display.x.toFixed(3)),
                y: Number(display.y.toFixed(3)),
                z: Number(display.z.toFixed(3)),
                scaleMultiplier: Number(display.scaleMultiplier.toFixed(4)),
            },
            bounds,
        });
    }

    return {
        roots: [...roots, ...instancing.roots],
        summary: {
            ...plan,
            ok: plan.ok && rendered.length === plan.samples.length,
            renderedTrees: rendered.length,
            rendered,
        },
        instancing: instancing.summary,
    };
}

function disposeLoadedScene(root) {
    root.traverse((child) => {
        if (!child.isMesh) return;
        child.geometry?.dispose?.();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material?.dispose?.());
    });
}

export async function createRuntimeGlbPreview({
    scene,
    three,
    createTreeBranchMaterial,
    createTreeLeafMaterial,
    createRockMaterial,
}) {
    const loaderModules = await loadGltfLoaderModules();
    const { loader, dracoLoader } = createGltfLoader(loaderModules);
    const loadedAssets = [];
    const rendered = [];
    const productionPlacementRoots = [];
    let adapter = null;
    let productionPlacementPreview = null;
    let productionInstancingPreview = null;
    let diagnosticRockPlacementPreview = null;
    let diagnosticRockInstancingPreview = null;

    try {
        for (const asset of RUNTIME_GLB_RENDER_PREVIEW_ASSETS) {
            const root = await loadScene(loader, asset.path);
            loadedAssets.push({ asset, root });
        }

        const trees = {};
        const treesLod1 = {};
        const rocks = {};
        for (const { asset, root } of loadedAssets) {
            if (asset.group === 'tree-lod0') trees[asset.key] = root;
            else if (asset.group === 'tree-lod1') treesLod1[asset.key] = root;
            else if (asset.group === 'rock-lod0') rocks[asset.key] = root;
        }

        adapter = applyKonveyorTreeRockMaterials({
            trees,
            treesLod1,
            rocks,
            createTreeBranchMaterial,
            createTreeLeafMaterial,
            createRockMaterial,
        });
        const replacementByAsset = new Map([
            ...adapter.treeResults,
            ...adapter.rockResults,
        ].map((result) => [`${result.group}:${result.key}`, result]));
        const rootsByAsset = new Map();

        for (const { asset, root } of loadedAssets) {
            const replacement = replacementByAsset.get(`${asset.group}:${asset.key}`);
            rootsByAsset.set(`${asset.group}:${asset.key}`, root.clone(true));
            const bounds = fitAsset(asset, root, three);
            scene.add(root);
            rendered.push({
                key: asset.key,
                group: asset.group,
                role: asset.role,
                path: asset.path,
                replacement,
                bounds,
            });
        }

        const placement = await createProductionPlacementPreview({ scene, rootsByAsset, three });
        productionPlacementRoots.push(...placement.roots);
        productionPlacementPreview = placement.summary;
        productionInstancingPreview = placement.instancing;

        const rockPlacement = await createDiagnosticRockPlacementPreview({ scene, rootsByAsset, three });
        productionPlacementRoots.push(...rockPlacement.roots);
        diagnosticRockPlacementPreview = rockPlacement.summary;
        diagnosticRockInstancingPreview = rockPlacement.instancing;
    } catch (err) {
        productionPlacementRoots.forEach((root) => scene.remove(root));
        loadedAssets.forEach(({ root }) => {
            scene.remove(root);
            disposeLoadedScene(root);
        });
        throw err;
    } finally {
        dracoLoader.dispose();
    }

    return {
        ok: rendered.every((item) => item.role === 'tree'
            ? item.replacement.missingTargets.length === 0
            : item.replacement.replacedMaterials > 0)
            && productionPlacementPreview?.ok === true
            && productionInstancingPreview?.ok === true
            && diagnosticRockPlacementPreview?.ok === true
            && diagnosticRockInstancingPreview?.ok === true,
        assets: RUNTIME_GLB_RENDER_PREVIEW_ASSETS.length,
        adapter: adapter ? {
            ok: adapter.ok,
            treeReplacedMaterials: adapter.treeReplacedMaterials,
            rockReplacedMaterials: adapter.rockReplacedMaterials,
        } : null,
        productionPlacementPreview,
        productionInstancingPreview,
        diagnosticRockPlacementPreview,
        diagnosticRockInstancingPreview,
        rendered,
        dispose() {
            productionPlacementRoots.forEach((root) => scene.remove(root));
            loadedAssets.forEach(({ root }) => disposeLoadedScene(root));
        },
    };
}
