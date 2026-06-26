// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function triangleCount(root) {
    let meshes = 0;
    let triangles = 0;
    root.traverse((node) => {
        if (!node.isMesh || !node.geometry) return;
        meshes += 1;
        const geometry = node.geometry;
        const count = geometry.index?.count ?? geometry.attributes?.position?.count ?? 0;
        triangles += count / 3;
        node.castShadow = true;
        node.receiveShadow = true;
    });
    return { meshes, triangles: Math.round(triangles) };
}

function terrainY(game, x, z) {
    return game.heightfield?.surfaceY?.(x, z)
        ?? game.heightfield?.sample?.(x, z)
        ?? game.terrainBuilder?.sampleTerrainHeight?.(x, z)
        ?? 0;
}

function fitRoot(asset, sourceRoot) {
    const wrapper = new THREE.Group();
    wrapper.name = `AssetReview_${asset.key}`;
    sourceRoot.name = asset.key;
    wrapper.add(sourceRoot);

    let box = new THREE.Box3().setFromObject(sourceRoot);
    const initialSize = box.getSize(new THREE.Vector3());
    if (Number.isFinite(asset.targetHeight) && asset.targetHeight > 0 && initialSize.y > 0) {
        sourceRoot.scale.multiplyScalar(asset.targetHeight / initialSize.y);
    }

    box = new THREE.Box3().setFromObject(sourceRoot);
    const center = box.getCenter(new THREE.Vector3());
    sourceRoot.position.x -= center.x;
    sourceRoot.position.z -= center.z;
    sourceRoot.position.y -= box.min.y;

    return wrapper;
}

function measureRoot(root) {
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    return {
        minY: +box.min.y.toFixed(4),
        maxY: +box.max.y.toFixed(4),
        width: +size.x.toFixed(4),
        height: +size.y.toFixed(4),
        depth: +size.z.toFixed(4),
    };
}

function cameraPoint(game, point) {
    return {
        x: point.x,
        y: Number.isFinite(point.dy) ? terrainY(game, point.x, point.z) + point.dy : point.y,
        z: point.z,
    };
}

function applyReviewCamera(game, cameraConfig) {
    if (!cameraConfig?.pos || !cameraConfig?.target) return false;
    const camera = game.sceneManager?.getCamera?.();
    if (!camera) return false;
    const pos = cameraPoint(game, cameraConfig.pos);
    const target = cameraPoint(game, cameraConfig.target);
    if (Number.isFinite(cameraConfig.fov)) {
        camera.fov = cameraConfig.fov;
        camera.updateProjectionMatrix();
    }
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(target.x, target.y, target.z);
    game.atmosphere?.syncCamera?.(camera.position);
    game.atmosphere?.setTerrainYAtCamera?.(terrainY(game, pos.x, pos.z));
    if (window.__sdsCinema) {
        window.__sdsCinema.freeFlyActive = true;
        window.__sdsCinema.pauseSimulation?.();
        window.__sdsCinema.hideUI?.();
        window.__sdsCinema.renderFrame?.();
    }
    return true;
}

function loadGltf(loader, path) {
    return new Promise((resolve, reject) => {
        loader.load(path, (gltf) => resolve(gltf.scene), undefined, reject);
    });
}

function disposeRoot(root) {
    root.traverse((node) => {
        if (!node.isMesh) return;
        node.geometry?.dispose?.();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        materials.forEach((material) => material?.dispose?.());
    });
}

function hideExistingFarmhouse(game) {
    const hidden = [];
    for (const building of game.terrainBuilder?.buildings ?? []) {
        if (!building || building.visible === false) continue;
        hidden.push({ node: building, visible: building.visible });
        building.visible = false;
    }
    return hidden;
}

function ready(game) {
    if (window.__perfHarness?.isReady?.() === true) return true;
    const sheep = game.gameState?.getSheep?.() ?? [];
    return sheep.length > 0 && !!game.sceneManager?.getRenderer?.();
}

async function waitReady(game, timeoutMs = 90000) {
    const start = performance.now();
    const params = new URLSearchParams(window.location.search);
    const needsCinema = params.get('cinematic') === '1';
    while (!ready(game)) {
        if (performance.now() - start > timeoutMs) {
            throw new Error('asset review scene ready timeout');
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    while (needsCinema && !window.__sdsCinema) {
        if (performance.now() - start > timeoutMs) {
            throw new Error('asset review cinematic ready timeout');
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function holdReviewCamera(game, cameraConfig) {
    if (!cameraConfig) return false;
    let frames = 90;
    const tick = () => {
        applyReviewCamera(game, cameraConfig);
        frames -= 1;
        if (frames > 0) requestAnimationFrame(tick);
    };
    tick();
    return true;
}

function placementByKey(manifest) {
    return new Map((manifest.placements ?? []).map((placement) => [placement.key, placement]));
}

export function installAssetReviewHarness(game) {
    if (typeof window === 'undefined') return null;
    if (window.__sdsAssetReview) return window.__sdsAssetReview;

    const loader = new GLTFLoader();
    const roots = [];
    const hiddenObjects = [];
    let lastSummary = null;

    const api = {
        async mount(manifest) {
            api.clear();
            const scene = game.sceneManager?.getScene?.();
            if (!scene) throw new Error('asset review scene unavailable');

            if (manifest.hideExistingFarmhouse) {
                hiddenObjects.push(...hideExistingFarmhouse(game));
            }

            const placements = placementByKey(manifest);
            const rendered = [];
            for (const asset of manifest.assets ?? []) {
                const placement = placements.get(asset.key);
                if (!placement) continue;
                const sourceRoot = await loadGltf(loader, asset.path);
                const root = fitRoot(asset, sourceRoot);
                root.position.set(
                    placement.x,
                    terrainY(game, placement.x, placement.z) + (placement.yOffset ?? 0),
                    placement.z,
                );
                root.rotation.y = placement.rotationY ?? 0;
                scene.add(root);
                roots.push(root);
                rendered.push({
                    key: asset.key,
                    path: asset.path,
                    position: {
                        x: +root.position.x.toFixed(3),
                        y: +root.position.y.toFixed(3),
                        z: +root.position.z.toFixed(3),
                    },
                    bounds: measureRoot(root),
                    ...triangleCount(root),
                });
            }

            const cameraApplied = holdReviewCamera(game, manifest.camera);
            lastSummary = {
                ok: rendered.length === (manifest.assets ?? []).length,
                manifest: manifest.name ?? null,
                scene: game.currentScene?.id ?? window.__currentSceneId ?? null,
                assets: rendered.length,
                hiddenObjects: hiddenObjects.length,
                cameraApplied,
                rendered,
            };
            window.__sdsAssetReviewState = lastSummary;
            console.log('[ASSET-REVIEW]', lastSummary);
            return lastSummary;
        },
        async mountManifest(path) {
            await waitReady(game);
            const response = await fetch(path, { cache: 'no-store' });
            if (!response.ok) throw new Error(`asset review manifest load failed: ${response.status} ${path}`);
            return api.mount(await response.json());
        },
        clear() {
            const scene = game.sceneManager?.getScene?.();
            while (roots.length) {
                const root = roots.pop();
                scene?.remove(root);
                disposeRoot(root);
            }
            while (hiddenObjects.length) {
                const hidden = hiddenObjects.pop();
                hidden.node.visible = hidden.visible;
            }
            lastSummary = null;
            window.__sdsAssetReviewState = null;
        },
        state() {
            return lastSummary;
        },
    };

    window.__sdsAssetReview = api;
    const params = new URLSearchParams(window.location.search);
    const manifestPath = params.get('assetReviewManifest');
    if (manifestPath) {
        api.mountManifest(manifestPath).catch((err) => {
            window.__sdsAssetReviewState = { ok: false, error: String(err?.message || err) };
            console.warn('[ASSET-REVIEW] mount failed:', err);
        });
    }
    return api;
}
