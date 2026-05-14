import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './webgpuMaterialReplacement.js';

const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/v1/decoders/';

export const RUNTIME_GLB_RENDER_PREVIEW_ASSETS = [
    {
        key: 'tree1-lod0',
        role: 'tree',
        path: 'assets/models/trees/tree1.glb',
        targetHeight: 0.72,
        position: [-1.98, -0.86, 0.32],
        rotationY: 0.35,
    },
    {
        key: 'rock1-lod0',
        role: 'rock',
        path: 'assets/models/rocks/rock1.glb',
        targetHeight: 0.46,
        position: [2.18, -0.82, 0.32],
        rotationY: -0.25,
    },
];

async function loadGltfLoaderModules() {
    const vendorPath = './vendor/three/examples/jsm/';
    const [
        { GLTFLoader },
        { DRACOLoader },
        { MeshoptDecoder },
    ] = await Promise.all([
        import(/* @vite-ignore */ new URL(`${vendorPath}loaders/GLTFLoader.js`, import.meta.url).href),
        import(/* @vite-ignore */ new URL(`${vendorPath}loaders/DRACOLoader.js`, import.meta.url).href),
        import(/* @vite-ignore */ new URL(`${vendorPath}libs/meshopt_decoder.module.js`, import.meta.url).href),
    ]);

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
    const roots = [];
    const rendered = [];

    try {
        for (const asset of RUNTIME_GLB_RENDER_PREVIEW_ASSETS) {
            const root = await loadScene(loader, asset.path);
            const replacement = asset.role === 'tree'
                ? replaceTreeMaterialsByName(root, {
                    branches: createTreeBranchMaterial,
                    leaves: createTreeLeafMaterial,
                })
                : replaceRockMaterialsByTraversal(root, createRockMaterial);
            const bounds = fitAsset(asset, root, three);
            scene.add(root);
            roots.push(root);
            rendered.push({
                key: asset.key,
                role: asset.role,
                path: asset.path,
                replacement,
                bounds,
            });
        }
    } catch (err) {
        roots.forEach((root) => {
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
            : item.replacement.replacedMaterials > 0),
        assets: RUNTIME_GLB_RENDER_PREVIEW_ASSETS.length,
        rendered,
        dispose() {
            roots.forEach(disposeLoadedScene);
        },
    };
}
