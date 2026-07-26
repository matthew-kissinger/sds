// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Matthew Kissinger
import * as THREE from 'three';

import { Atmosphere } from '../atmosphere/Atmosphere.js';
import { createWebGpuAtmosphereMaterial } from '../atmosphere/webgpuAtmosphereMaterialAdapter.js';
import { PortalEffect } from '../effects/PortalEffect.js';
import { SunBillboard } from '../effects/SunBillboard.js';
import { SceneManager } from '../SceneManager.js';
import { configureProductionRenderer } from '../rendering/sceneRendererSetup.js';
import { TerrainBuilder } from '../TerrainBuilder.js';
import { createAnimeWater } from '../water/AnimeWater.js';
import { GrassSystem } from '../GrassSystem.js';
import {
    createKilnImpostorGeometry,
    createKilnImpostorMaterial,
} from '../kiln-impostor-material.js';
import { OptimizedSheepSystem } from '../OptimizedSheep.js';
import { geometryTriangleCount } from '../utils/TriangleCount.js';
import { DEFAULT_SCENE_ID, getSceneById } from '../../shared/scenes/index.js';
import { Heightfield } from '../../shared/terrain/Heightfield.js';
import {
    RUNTIME_GLB_RENDER_PREVIEW_ASSETS,
    createRuntimeGlbPreview,
} from './webgpuRuntimeGlbPreview.js';

const SCENE_MANAGER_KILN_IMPOSTOR_SOURCE = Object.freeze({
    treeType: 'tree1',
    basePath: '/assets/models/trees/tree1.imposter',
});

export function shouldRunSceneManagerWebGpuProof(search = '') {
    const params = new URLSearchParams(search || '');
    return params.get('renderer') === 'webgpu'
        && params.get('diagnostic') === '1'
        && params.get('webgpuSceneManagerProof') === '1';
}

export async function createSceneManagerWebGpuRendererProof(webGpuModules, {
    container = document.getElementById('canvas-container') || document.body,
    width = 320,
    height = 180,
    sceneBinding = null,
    skyFog = null,
    heightTexture = null,
    atmosphereFactories = null,
    effectFactories = null,
    treeRockFactories = null,
    terrainFactories = null,
    waterFactories = null,
    grassFactories = null,
    sheepFactories = null,
    impostorFactories = null,
    useGlobalFactories = false,
} = {}) {
    const { WebGPURenderer } = webGpuModules;
    const factorySupply = resolveSceneManagerFactorySupply({
        atmosphereFactories,
        effectFactories,
        treeRockFactories,
        terrainFactories,
        waterFactories,
        grassFactories,
        sheepFactories,
        impostorFactories,
    }, { useGlobalFactories });
    const canvas = document.createElement('canvas');
    canvas.dataset.webgpuSceneManagerWebgpuProof = '1';
    canvas.style.cssText = [
        'position:fixed',
        'right:12px',
        'bottom:12px',
        `width:${width}px`,
        `height:${height}px`,
        'z-index:45',
        'border:1px solid #355',
        'background:#111',
    ].join(';');

    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    const sceneManager = new SceneManager({
        createRenderer: () => renderer,
        configureRenderer: (nextRenderer, options) => configureProductionRenderer(nextRenderer, options),
    });

    const rendererReady = await sceneManager.whenRendererReady();
    if (!rendererReady) throw new Error('SceneManager WebGPU renderer initialization failed');
    renderer.setSize(width, height, true);
    canvas.style.setProperty('position', 'fixed');
    canvas.style.setProperty('right', '12px');
    canvas.style.setProperty('bottom', '12px');
    canvas.style.setProperty('width', `${width}px`, 'important');
    canvas.style.setProperty('height', `${height}px`, 'important');
    canvas.style.setProperty('z-index', '45');
    canvas.style.setProperty('border', '1px solid #355');
    canvas.style.setProperty('background', '#111');
    sceneManager.camera.aspect = width / height;
    sceneManager.camera.updateProjectionMatrix();

    const marker = new THREE.Mesh(
        new THREE.BoxGeometry(14, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0x33d1ff })
    );
    marker.name = 'webgpu-scene-manager-webgpu-marker';
    marker.position.set(0, 7, 0);
    sceneManager.scene.add(marker);
    sceneManager.camera.position.set(0, 0.2, 3);
    sceneManager.camera.lookAt(0, -0.72, 0.1);
    const lightingBridge = createWebGpuProofLightingBridge(sceneManager, webGpuModules);

    const atmosphereIsland = createProductionAtmosphereSceneManagerIsland({
        sceneManager,
        webGpuModules,
        sceneBinding,
        skyFog,
        atmosphereFactories: factorySupply.atmosphereFactories,
    });
    const sunBillboardIsland = createProductionSunBillboardSceneManagerIsland({
        sceneManager,
        skyFog,
        effectFactories: factorySupply.effectFactories,
    });
    const effectIsland = await createProductionEffectSceneManagerIsland({
        sceneManager,
        effectFactories: factorySupply.effectFactories,
    });
    const treeRockIsland = await createProductionTreeRockSceneManagerIsland({
        sceneManager,
        sceneBinding,
        webGpuModules,
        treeRockFactories: factorySupply.treeRockFactories,
    });
    const terrainIsland = createProductionTerrainSceneManagerIsland({
        sceneManager,
        sceneBinding,
        heightTexture,
        terrainFactories: factorySupply.terrainFactories,
    });
    const waterIsland = createProductionWaterSceneManagerIsland({
        sceneManager,
        sceneBinding,
        heightTexture,
        waterFactories: factorySupply.waterFactories,
    });
    const grassIsland = createProductionGrassSceneManagerIsland({
        sceneManager,
        sceneBinding,
        heightTexture,
        grassFactories: factorySupply.grassFactories,
    });
    const sheepIsland = createProductionSheepSceneManagerIsland({
        sceneManager,
        sceneBinding,
        sheepFactories: factorySupply.sheepFactories,
    });
    const impostorIsland = await createProductionKilnImpostorSceneManagerIsland({
        sceneManager,
        webGpuModules,
        skyFog,
        impostorFactories: factorySupply.impostorFactories,
    });

    let renderError = null;
    let renderResult = null;
    try {
        renderResult = await sceneManager.render();
        if (renderResult === false) {
            renderError = sceneManager.getRenderStatus?.().lastError ?? 'SceneManager.render returned false';
        }
    } catch (err) {
        renderError = String(err?.message || err);
    }
    const renderStatus = sceneManager.getRenderStatus?.() ?? null;

    const checks = {
        rendererInjected: sceneManager.getRenderer() === renderer,
        webgpuRenderer: renderer.isWebGPURenderer === true || renderer.constructor?.name === 'WebGPURenderer',
        sceneManagerScene: sceneManager.getScene()?.isScene === true,
        sceneManagerCamera: sceneManager.getCamera()?.isPerspectiveCamera === true,
        canvasAppended: container.contains(canvas),
        setupRecorded: sceneManager.rendererSetup?.rendererMode === 'non-webgl',
        rendererReady: renderStatus?.rendererReady === true,
        markerAdded: sceneManager.scene.children.includes(marker),
        factorySupplyReady: factorySupply.proof.ok === true,
        webGpuLightingBridge: lightingBridge?.proof?.ok === true,
        productionAtmosphereIsland: atmosphereIsland?.proof?.ok === true,
        productionSunBillboardIsland: sunBillboardIsland?.proof?.ok === true,
        productionEffectIsland: effectIsland?.proof?.ok === true,
        productionTreeRockIsland: treeRockIsland?.proof?.ok === true,
        productionTerrainIsland: terrainIsland?.proof?.ok === true,
        productionWaterIsland: waterIsland?.proof?.ok === true,
        productionGrassIsland: grassIsland?.proof?.ok === true,
        productionSheepIsland: sheepIsland?.proof?.ok === true,
        productionImpostorIsland: impostorIsland?.proof?.ok === true,
        sceneManagerAsyncRender: renderStatus?.mode === 'async'
            && renderStatus.inFlight === false
            && renderStatus.lastError === null,
        rendered: renderError === null,
    };

    const rect = canvas.getBoundingClientRect();
    const proof = {
        source: 'scene-manager-injected-webgpu-renderer-proof',
        rendererClassName: renderer.constructor?.name ?? null,
        rendererSetup: sceneManager.rendererSetup ?? null,
        canvas: {
            width: canvas.width,
            height: canvas.height,
            cssWidth: width,
            cssHeight: height,
            rectWidth: Number(rect.width.toFixed(2)),
            rectHeight: Number(rect.height.toFixed(2)),
            dataset: { ...canvas.dataset },
        },
        scene: {
            childCount: sceneManager.scene.children.length,
            hasMarker: checks.markerAdded,
            backgroundHex: sceneManager.scene.background?.getHexString?.() ?? null,
            fogNear: sceneManager.scene.fog?.near ?? null,
            fogFar: sceneManager.scene.fog?.far ?? null,
        },
        camera: {
            near: sceneManager.camera.near,
            far: sceneManager.camera.far,
            aspect: sceneManager.camera.aspect,
        },
        factorySupply: factorySupply.proof,
        webGpuLightingBridge: lightingBridge?.proof ?? null,
        productionAtmosphereIsland: atmosphereIsland?.proof ?? null,
        productionSunBillboardIsland: sunBillboardIsland?.proof ?? null,
        productionEffectIsland: effectIsland?.proof ?? null,
        productionTreeRockIsland: treeRockIsland?.proof ?? null,
        productionTerrainIsland: terrainIsland?.proof ?? null,
        productionWaterIsland: waterIsland?.proof ?? null,
        productionGrassIsland: grassIsland?.proof ?? null,
        productionSheepIsland: sheepIsland?.proof ?? null,
        productionImpostorIsland: impostorIsland?.proof ?? null,
        renderStatus,
        renderError,
        checks,
        ok: Object.values(checks).every(Boolean),
    };

    const dispose = () => {
        marker.geometry.dispose();
        marker.material.dispose();
        sceneManager.scene.remove(marker);
        lightingBridge?.dispose?.();
        atmosphereIsland?.dispose?.();
        sunBillboardIsland?.dispose?.();
        effectIsland?.dispose?.();
        treeRockIsland?.dispose?.();
        grassIsland?.dispose?.();
        sheepIsland?.dispose?.();
        impostorIsland?.dispose?.();
        waterIsland?.dispose?.();
        terrainIsland?.dispose?.();
        renderer.dispose();
        canvas.remove();
    };

    return { proof, dispose };
}

function resolveSceneManagerFactorySupply(explicitFactories, { useGlobalFactories }) {
    const globalFactories = typeof window === 'undefined' ? {} : {
        atmosphereFactories: window.__sdsWebGpuAtmosphereMaterialFactories,
        effectFactories: window.__sdsWebGpuEffectMaterialFactories,
        treeRockFactories: window.__sdsWebGpuMaterialFactories,
        terrainFactories: window.__sdsWebGpuTerrainMaterialFactories,
        waterFactories: window.__sdsWebGpuWaterMaterialFactories,
        grassFactories: window.__sdsWebGpuGrassMaterialFactories,
        sheepFactories: window.__sdsWebGpuSheepMaterialFactories,
        impostorFactories: window.__sdsWebGpuImpostorMaterialFactories,
    };
    const source = useGlobalFactories ? 'window-global' : 'argument';
    const supply = {
        atmosphereFactories: useGlobalFactories ? globalFactories.atmosphereFactories : explicitFactories.atmosphereFactories,
        effectFactories: useGlobalFactories ? globalFactories.effectFactories : explicitFactories.effectFactories,
        treeRockFactories: useGlobalFactories ? globalFactories.treeRockFactories : explicitFactories.treeRockFactories,
        terrainFactories: useGlobalFactories ? globalFactories.terrainFactories : explicitFactories.terrainFactories,
        waterFactories: useGlobalFactories ? globalFactories.waterFactories : explicitFactories.waterFactories,
        grassFactories: useGlobalFactories ? globalFactories.grassFactories : explicitFactories.grassFactories,
        sheepFactories: useGlobalFactories ? globalFactories.sheepFactories : explicitFactories.sheepFactories,
        impostorFactories: useGlobalFactories ? globalFactories.impostorFactories : explicitFactories.impostorFactories,
    };
    const groups = {
        atmosphere: !!supply.atmosphereFactories,
        effects: !!supply.effectFactories,
        treeRock: !!supply.treeRockFactories,
        terrain: !!supply.terrainFactories,
        water: !!supply.waterFactories,
        grass: !!supply.grassFactories,
        sheep: !!supply.sheepFactories,
        impostor: !!supply.impostorFactories,
    };
    return {
        ...supply,
        proof: {
            source: 'scene-manager-webgpu-factory-supply',
            mode: source,
            groups,
            ok: Object.values(groups).every(Boolean),
        },
    };
}

async function createProductionKilnImpostorSceneManagerIsland({
    sceneManager,
    webGpuModules,
    skyFog,
    impostorFactories,
}) {
    if (!impostorFactories) return null;

    const assets = await createSceneManagerKilnImpostorAssets(webGpuModules);
    const material = createKilnImpostorMaterial({
        albedoAtlas: assets.albedoAtlas,
        normalAtlas: assets.normalAtlas,
        depthAtlas: assets.depthAtlas,
        sidecar: assets.sidecar,
        search: '?renderer=webgpu&webgpuImpostors=1',
        webgpuImpostorFactories: impostorFactories,
    });
    const geometry = createKilnImpostorGeometry(assets.sidecar);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'webgpu-scene-manager-kiln-impostor';
    mesh.position.set(-0.62, -1.02, 0.48);
    mesh.rotation.set(0, 0.12, 0);
    mesh.scale.setScalar(0.16);
    mesh.frustumCulled = false;
    mesh.renderOrder = 7;
    sceneManager.scene.add(mesh);

    const summary = material.userData?.webgpuImpostorMaterialSummary ?? null;
    const sidecar = assets.sidecar;
    const checks = {
        factoryApplied: summary?.applied === true,
        nodeMaterial: material.name === 'webgpu-node-kiln-impostor'
            && material.isNodeMaterial === true,
        kilnTagged: material.userData?.isKilnImpostor === true
            && material.userData?.sidecar === sidecar,
        texturesLoaded: assets.albedoAtlas?.isTexture === true
            && assets.normalAtlas?.isTexture === true
            && assets.depthAtlas?.isTexture === true,
        layoutMatchesSidecar: sidecar.tilesX === 4
            && sidecar.tilesY === 4
            && sidecar.atlasWidth === 2048
            && sidecar.atlasHeight === 2048,
        geometryMatchesBakeFrustum: geometry.attributes?.position?.count === 6
            && geometry.attributes?.uv?.count === 6,
        meshOwnedBySceneManager: sceneManager.scene.children.includes(mesh),
        depthAuxLayerPresent: Array.isArray(sidecar.auxLayers)
            ? sidecar.auxLayers.includes('depth')
            : sidecar.auxLayers?.depth === true,
        fogBound: Array.isArray(skyFog?.fogColor)
            && Number.isFinite(skyFog.fogNear)
            && Number.isFinite(skyFog.fogFar),
        disposeCallable: typeof material.dispose === 'function'
            && typeof geometry.dispose === 'function',
    };

    return {
        dispose: () => {
            sceneManager.scene.remove(mesh);
            geometry.dispose();
            material.dispose();
            assets.albedoAtlas.dispose();
            assets.normalAtlas.dispose();
            assets.depthAtlas.dispose();
        },
        proof: {
            source: 'scene-manager-production-kiln-impostor-webgpu-node-island',
            treeType: SCENE_MANAGER_KILN_IMPOSTOR_SOURCE.treeType,
            basePath: SCENE_MANAGER_KILN_IMPOSTOR_SOURCE.basePath,
            materialName: material.name ?? null,
            isNodeMaterial: material.isNodeMaterial === true,
            summary,
            sidecar: {
                tilesX: sidecar.tilesX,
                tilesY: sidecar.tilesY,
                tileSize: sidecar.tileSize ?? null,
                atlasSize: [sidecar.atlasWidth ?? null, sidecar.atlasHeight ?? null],
                worldSize: sidecar.worldSize ?? null,
                yOffset: sidecar.yOffset ?? null,
                colorLayer: sidecar.colorLayer ?? null,
                normalSpace: sidecar.normalSpace ?? null,
                auxLayers: sidecar.auxLayers ?? null,
                bbox: sidecar.bbox ?? null,
            },
            textures: {
                albedoName: assets.albedoAtlas.name ?? null,
                normalName: assets.normalAtlas.name ?? null,
                depthName: assets.depthAtlas.name ?? null,
                albedoColorSpace: assets.albedoAtlas.colorSpace ?? null,
                normalColorSpace: assets.normalAtlas.colorSpace ?? null,
                depthColorSpace: assets.depthAtlas.colorSpace ?? null,
                generateMipmaps: {
                    albedo: assets.albedoAtlas.generateMipmaps,
                    normal: assets.normalAtlas.generateMipmaps,
                    depth: assets.depthAtlas.generateMipmaps,
                },
            },
            mesh: {
                name: mesh.name,
                renderOrder: mesh.renderOrder,
                frustumCulled: mesh.frustumCulled,
                scale: mesh.scale.x,
                position: mesh.position.toArray(),
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

async function createSceneManagerKilnImpostorAssets({
    TextureLoader,
    LinearFilter,
    ClampToEdgeWrapping,
    SRGBColorSpace,
    NoColorSpace,
}) {
    const sidecarResponse = await fetch(`${SCENE_MANAGER_KILN_IMPOSTOR_SOURCE.basePath}.json`);
    if (!sidecarResponse.ok) {
        throw new Error('scene manager kiln impostor sidecar fetch failed');
    }
    const sidecar = await sidecarResponse.json();
    const loader = new TextureLoader();
    const loadTexture = (url, colorSpace) => new Promise((resolve, reject) => {
        loader.load(
            url,
            (texture) => {
                texture.name = url;
                texture.colorSpace = colorSpace;
                texture.minFilter = LinearFilter;
                texture.magFilter = LinearFilter;
                texture.wrapS = ClampToEdgeWrapping;
                texture.wrapT = ClampToEdgeWrapping;
                texture.generateMipmaps = false;
                texture.needsUpdate = true;
                resolve(texture);
            },
            undefined,
            reject
        );
    });

    const [albedoAtlas, normalAtlas, depthAtlas] = await Promise.all([
        loadTexture(`${SCENE_MANAGER_KILN_IMPOSTOR_SOURCE.basePath}.png`, SRGBColorSpace),
        loadTexture(`${SCENE_MANAGER_KILN_IMPOSTOR_SOURCE.basePath}.normal.png`, NoColorSpace),
        loadTexture(`${SCENE_MANAGER_KILN_IMPOSTOR_SOURCE.basePath}.depth.png`, NoColorSpace),
    ]);
    return { sidecar, albedoAtlas, normalAtlas, depthAtlas };
}

function createWebGpuProofLightingBridge(sceneManager, webGpuModules) {
    const { AmbientLight, DirectionalLight } = webGpuModules;
    if (typeof AmbientLight !== 'function' || typeof DirectionalLight !== 'function') return null;

    const ambient = new AmbientLight(0xffffff, 0.75 * Math.PI);
    const directional = new DirectionalLight(0xffffff, 1.1 * Math.PI);
    directional.position.set(1.5, 2.2, 3.0);
    sceneManager.scene.add(ambient);
    sceneManager.scene.add(directional);

    const checks = {
        ambientAdded: sceneManager.scene.children.includes(ambient),
        directionalAdded: sceneManager.scene.children.includes(directional),
        proofOnlyBridge: true,
    };

    return {
        dispose: () => {
            sceneManager.scene.remove(ambient);
            sceneManager.scene.remove(directional);
        },
        proof: {
            source: 'scene-manager-webgpu-proof-lighting-bridge',
            reason: 'diagnostic WebGPU module split needs WebGPU-module lights for lit node materials',
            productionSceneManagerLightsStillPresent: sceneManager.scene.children.some((child) => child.isLight === true
                && child !== ambient
                && child !== directional),
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createProductionGrassSceneManagerIsland({
    sceneManager,
    sceneBinding,
    heightTexture,
    grassFactories,
}) {
    if (!heightTexture || !grassFactories) return null;

    const sourceScene = resolveHeightTextureScene(heightTexture);
    const heightfield = createHeightfieldFromTexture(heightTexture);
    heightfield.bakeMeshGrid({ segments: 256, size: 3200 });
    const grass = new GrassSystem(
        sceneManager.scene,
        false,
        sourceScene?.grass ?? null,
        heightfield,
        sourceScene?.boundary ?? null,
        {
            search: '?renderer=webgpu&webgpuGrass=1',
            webgpuGrassFactories: grassFactories,
        }
    );

    grass.noiseTexture = grass.createNoiseTexture();
    grass.grassMaterial = grass.createGrassMaterial();
    grass.clumpGeometry = grass.createClumpGeometry();
    const chunkCenters = [[0, 0], [-30, 0], [30, 0], [0, -30], [0, 30]];
    let bladeChunk = null;
    for (let i = 0; i < chunkCenters.length && !bladeChunk; i++) {
        const [centerX, centerZ] = chunkCenters[i];
        bladeChunk = grass.createChunk(i, 0, centerX - 5, centerZ - 5, centerX + 5, centerZ + 5, 12);
    }
    if (bladeChunk?.mesh) {
        grass.chunks.set('scene-manager-blade', bladeChunk);
        bladeChunk.mesh.position.set(1.62, -1.08, 0.24);
        bladeChunk.mesh.scale.setScalar(0.055);
        bladeChunk.mesh.frustumCulled = false;
        bladeChunk.mesh.renderOrder = 3;
    }

    const meadowMaterial = grass.createMeadowQuadMaterial();
    const meadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.48, 1, 1), meadowMaterial);
    meadowMesh.position.set(1.46, -0.58, 0.11);
    meadowMesh.frustumCulled = false;
    meadowMesh.renderOrder = 2;
    sceneManager.scene.add(meadowMesh);

    const bladeSummary = grass.webgpuGrassBladeMaterialSummary
        ?? grass.grassMaterial?.userData?.webgpuGrassBladeMaterialSummary
        ?? null;
    const meadowSummary = grass.webgpuMeadowQuadMaterialSummary ?? null;
    const bladeData = grass.clumpGeometry?.attributes?.bladeData ?? null;
    const checks = {
        bladeFactoryApplied: bladeSummary?.applied === true,
        meadowFactoryApplied: meadowSummary?.applied === true,
        bladeNodeMaterial: grass.grassMaterial?.name === 'webgpu-node-grass-blade'
            && grass.grassMaterial?.isNodeMaterial === true,
        meadowNodeMaterial: meadowMaterial?.name === 'webgpu-node-meadow-quad'
            && meadowMaterial?.isNodeMaterial === true,
        sceneContainsBladeChunk: bladeChunk?.mesh?.isInstancedMesh === true
            && bladeChunk.mesh.count > 0
            && bladeChunk.mesh.count <= 12
            && sceneManager.scene.children.includes(bladeChunk.mesh),
        sceneContainsMeadow: sceneManager.scene.children.includes(meadowMesh),
        clumpGeometryBound: grass.clumpGeometry?.type === 'BufferGeometry'
            && grass.clumpGeometry?.attributes?.position?.count === grass.config.bladesPerClump * 4
            && bladeData?.itemSize === 4,
        sourceHeightfieldMatchesTexture: heightfieldMatchesTexture(heightfield, heightTexture),
        meshGridBound: heightfield.displacedHeights?.length === 66049,
        disposeCallable: typeof grass.dispose === 'function',
    };

    const dispose = () => {
        sceneManager.scene.remove(meadowMesh);
        meadowMesh.geometry?.dispose?.();
        grass.dispose();
    };

    return {
        dispose,
        proof: {
            source: 'scene-manager-production-grasssystem-webgpu-node-island',
            sceneId: sceneBinding?.sceneId ?? null,
            grassSourceSceneId: sourceScene?.id ?? null,
            blade: {
                materialName: grass.grassMaterial?.name ?? null,
                isNodeMaterial: grass.grassMaterial?.isNodeMaterial === true,
                summary: bladeSummary,
            },
            meadow: {
                materialName: meadowMaterial?.name ?? null,
                isNodeMaterial: meadowMaterial?.isNodeMaterial === true,
                summary: meadowSummary,
            },
            geometry: {
                bladesPerClump: grass.config.bladesPerClump,
                vertices: grass.clumpGeometry?.attributes?.position?.count ?? null,
                triangles: countGeometryTriangles(grass.clumpGeometry),
                bladeDataItemSize: bladeData?.itemSize ?? null,
                bladeDataCount: bladeData?.count ?? null,
            },
            chunk: {
                isInstancedMesh: bladeChunk?.mesh?.isInstancedMesh === true,
                instanceCount: bladeChunk?.mesh?.count ?? null,
                fullCount: bladeChunk?.mesh?.userData?.fullCount ?? null,
                clumpCount: bladeChunk?.clumpCount ?? null,
                frustumCulled: bladeChunk?.mesh?.frustumCulled ?? null,
            },
            heightfield: describeHeightfield(heightfield),
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createProductionSheepSceneManagerIsland({
    sceneManager,
    sceneBinding,
    sheepFactories,
}) {
    if (!sheepFactories) return null;

    const sheep = new OptimizedSheepSystem(sceneManager.scene, 3, {
        centerX: 0,
        centerZ: 0,
        spreadRadius: 1.2,
        defaultCount: 3,
    }, false, {
        search: '?renderer=webgpu&webgpuSheep=1',
        webgpuSheepFactories: sheepFactories,
    });

    if (sheep.instancedMesh) {
        sheep.instancedMesh.position.set(-1.5, -1.13, 0.56);
        sheep.instancedMesh.scale.setScalar(0.18);
        sheep.instancedMesh.frustumCulled = false;
        sheep.instancedMesh.renderOrder = 6;
    }

    const summary = sheep.webgpuSheepMaterialSummary
        ?? sheep.material?.userData?.webgpuSheepMaterialSummary
        ?? null;
    const attributes = Object.keys(sheep.mergedGeometry?.attributes ?? {});
    const checks = {
        factoryApplied: summary?.applied === true,
        nodeMaterial: sheep.material?.name === 'webgpu-node-sheep-wool'
            && sheep.material?.isNodeMaterial === true,
        instancedMeshPresent: sheep.instancedMesh?.isInstancedMesh === true
            && sheep.instancedMesh.count === 3
            && sceneManager.scene.children.includes(sheep.instancedMesh),
        geometryMerged: (sheep.mergedGeometry?.attributes?.position?.count ?? 0) > 0
            && geometryTriangleCount(sheep.mergedGeometry) > 0,
        vertexColorContract: sheep.material?.vertexColors === true
            && attributes.includes('color')
            && attributes.includes('vertexId'),
        instanceAttributeContract: attributes.includes('instanceData')
            && attributes.includes('instanceAnimation'),
        sheepDataInitialized: sheep.sheep?.length === 3,
        disposeCallable: typeof sheep.dispose === 'function',
    };

    return {
        dispose: () => sheep.dispose(),
        proof: {
            source: 'scene-manager-production-optimizedsheepsystem-webgpu-node-island',
            sceneId: sceneBinding?.sceneId ?? null,
            materialName: sheep.material?.name ?? null,
            isNodeMaterial: sheep.material?.isNodeMaterial === true,
            summary,
            mesh: {
                isInstancedMesh: sheep.instancedMesh?.isInstancedMesh === true,
                count: sheep.instancedMesh?.count ?? null,
                frustumCulled: sheep.instancedMesh?.frustumCulled ?? null,
                scale: sheep.instancedMesh?.scale?.x ?? null,
            },
            geometry: {
                vertices: sheep.mergedGeometry?.attributes?.position?.count ?? null,
                triangles: sheep.mergedGeometry ? geometryTriangleCount(sheep.mergedGeometry) : null,
                attributes,
            },
            sheepData: {
                count: sheep.sheep?.length ?? null,
                spawnRadius: sheep.spawnConfig?.spreadRadius ?? null,
                useExtremeBoids: sheep.useExtremeBoids === true,
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createProductionTerrainSceneManagerIsland({
    sceneManager,
    sceneBinding,
    heightTexture,
    terrainFactories,
}) {
    if (!heightTexture || !terrainFactories) return null;

    const sourceScene = resolveHeightTextureScene(heightTexture);
    const heightfield = createHeightfieldFromTexture(heightTexture);
    const builder = new TerrainBuilder(sceneManager.scene, true, sourceScene, {
        search: '?renderer=webgpu&webgpuTerrain=1',
        webgpuTerrainFactories: terrainFactories,
    });
    builder.setHeightfield(heightfield);
    const terrain = builder.createTerrain();
    terrain.position.set(0.0, -1.235, 0.14);
    terrain.scale.setScalar(0.00045);
    terrain.frustumCulled = false;
    terrain.renderOrder = 1;
    if (builder.terrainSkirtMesh) {
        builder.terrainSkirtMesh.position.set(0.0, -1.236, 0.14);
        builder.terrainSkirtMesh.scale.setScalar(0.00045);
        builder.terrainSkirtMesh.frustumCulled = false;
        builder.terrainSkirtMesh.renderOrder = 0;
    }

    const summary = builder.webgpuTerrainMaterialSummary
        ?? terrain.material.userData?.webgpuTerrainMaterialSummary
        ?? null;
    const productionHeightTexture = terrain.material.userData?.heightTexture ?? null;
    const checks = {
        factoryApplied: summary?.applied === true,
        nodeMaterial: terrain.material?.name === 'webgpu-node-terrain-heightfield'
            && terrain.material?.isNodeMaterial === true,
        sceneContainsTerrain: sceneManager.scene.children.includes(terrain),
        meshIsTerrainPlane: terrain?.isMesh === true
            && terrain?.geometry?.type === 'PlaneGeometry',
        productionHeightTexture: productionHeightTexture?.isDataTexture === true,
        sourceHeightfieldMatchesTexture: heightfieldMatchesTexture(heightfield, heightTexture),
        meshGridBound: heightfield.displacedHeights?.length === terrain.geometry.attributes.position.count,
        disposeCallable: typeof builder.dispose === 'function',
    };

    return {
        dispose: () => builder.dispose(),
        proof: {
            source: 'scene-manager-production-terrainbuilder-webgpu-node-island',
            sceneId: sceneBinding?.sceneId ?? null,
            terrainSourceSceneId: sourceScene?.id ?? null,
            materialName: terrain.material?.name ?? null,
            isNodeMaterial: terrain.material?.isNodeMaterial === true,
            summary,
            mesh: {
                name: terrain.name ?? '',
                geometryType: terrain.geometry?.type ?? null,
                vertices: terrain.geometry?.attributes?.position?.count ?? null,
                size: terrain.geometry?.parameters?.width ?? null,
                segments: terrain.geometry?.parameters?.widthSegments ?? null,
                scale: terrain.scale?.x ?? null,
                frustumCulled: terrain.frustumCulled ?? null,
                skirtSize: builder.terrainSkirtMesh?.geometry?.userData?.terrainSkirtSize ?? null,
                skirtInnerSize: builder.terrainSkirtMesh?.geometry?.userData?.terrainSkirtInnerSize ?? null,
                skirtTriangles: builder.terrainSkirtMesh?.geometry?.index?.count
                    ? builder.terrainSkirtMesh.geometry.index.count / 3
                    : null,
            },
            heightfield: describeHeightfield(heightfield),
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createProductionWaterSceneManagerIsland({
    sceneManager,
    sceneBinding,
    heightTexture,
    waterFactories,
}) {
    if (!heightTexture || !waterFactories) return null;

    const sourceScene = resolveHeightTextureScene(heightTexture);
    const boundary = sourceScene?.boundary?.kind === 'island'
        ? sourceScene.boundary
        : { kind: 'island', center: { x: 0, z: 0 }, radius: 180, falloff: 40 };
    const heightfield = createHeightfieldFromTexture(heightTexture);
    const water = createAnimeWater({
        boundary,
        heightfield,
        size: 2.0,
        y: -1.19,
        segments: 4,
        search: '?renderer=webgpu&webgpuWater=1',
        webgpuWaterFactories: waterFactories,
    });

    water.mesh.position.z = 0.11;
    water.mesh.frustumCulled = false;
    water.mesh.renderOrder = 2;
    sceneManager.scene.add(water.mesh);
    sceneManager.setWater({ mesh: water.mesh, water });
    water.update(1.25);

    const summary = water.webgpuWaterMaterialSummary
        ?? water.material.userData?.webgpuWaterMaterialSummary
        ?? null;
    const productionHeightTexture = water.material.userData?.heightTexture ?? null;
    const checks = {
        factoryApplied: summary?.applied === true,
        nodeMaterial: water.material?.name === 'webgpu-node-anime-water'
            && water.material?.isNodeMaterial === true,
        sceneContainsWater: sceneManager.scene.children.includes(water.mesh),
        sceneManagerWaterBound: sceneManager.waterBundle?.water === water
            && sceneManager.waterBundle?.mesh === water.mesh,
        meshIsWaterPlane: water.mesh?.isMesh === true
            && water.mesh?.geometry?.type === 'PlaneGeometry',
        productionHeightTexture: productionHeightTexture?.isDataTexture === true,
        sourceHeightfieldMatchesTexture: heightfieldMatchesTexture(heightfield, heightTexture),
        updateCallable: typeof water.update === 'function',
        disposeCallable: typeof water.dispose === 'function',
    };

    return {
        dispose: () => sceneManager.disposeWater(),
        proof: {
            source: 'scene-manager-production-anime-water-webgpu-node-island',
            sceneId: sceneBinding?.sceneId ?? null,
            waterSourceSceneId: sourceScene?.id ?? null,
            materialName: water.material?.name ?? null,
            isNodeMaterial: water.material?.isNodeMaterial === true,
            summary,
            mesh: {
                name: water.mesh?.name ?? '',
                geometryType: water.mesh?.geometry?.type ?? null,
                size: 2.0,
                segments: 4,
                y: water.mesh?.position?.y ?? null,
                z: water.mesh?.position?.z ?? null,
                frustumCulled: water.mesh?.frustumCulled ?? null,
            },
            boundary: {
                kind: boundary.kind,
                center: [boundary.center?.x ?? 0, boundary.center?.z ?? 0],
                radius: boundary.radius,
                falloff: boundary.falloff,
            },
            heightfield: describeHeightfield(heightfield),
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createProductionSunBillboardSceneManagerIsland({
    sceneManager,
    skyFog,
    effectFactories,
}) {
    if (!skyFog || !effectFactories) return null;

    const sun = new SunBillboard(sceneManager.scene, {
        distance: 320,
        size: 28,
        search: '?renderer=webgpu&webgpuEffects=1',
        webgpuEffectFactories: effectFactories,
    });
    const sunDirection = new THREE.Vector3(...(skyFog.sunDirection ?? [0, 1, 0]));
    const sunColor = new THREE.Color(...(skyFog.sunColor ?? [1, 0.92, 0.72]));
    sun.update(sceneManager.camera, sunDirection, sunColor);

    const checks = {
        factoryApplied: sun.webgpuMaterialSummary?.applied === true,
        nodeMaterial: sun.material?.name === 'webgpu-node-sun-billboard'
            && sun.material?.isNodeMaterial === true,
        controlsConnected: !!sun.materialControls?.update,
        sceneContainsSun: sceneManager.scene.children.includes(sun.mesh),
        meshNamed: sun.mesh?.name === 'SunBillboard',
        positionedFromCamera: Number.isFinite(sun.mesh?.position?.x)
            && Number.isFinite(sun.mesh?.position?.y)
            && Number.isFinite(sun.mesh?.position?.z)
            && sun.mesh.position.distanceTo(sceneManager.camera.position) > 250,
    };

    return {
        dispose: () => sun.dispose(),
        proof: {
            source: 'scene-manager-production-sun-billboard-webgpu-node-island',
            materialName: sun.material?.name ?? null,
            isNodeMaterial: sun.material?.isNodeMaterial === true,
            summary: sun.webgpuMaterialSummary ?? null,
            hasControls: !!sun.materialControls?.update,
            position: {
                x: Number(sun.mesh.position.x.toFixed(2)),
                y: Number(sun.mesh.position.y.toFixed(2)),
                z: Number(sun.mesh.position.z.toFixed(2)),
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

async function createProductionEffectSceneManagerIsland({
    sceneManager,
    effectFactories,
}) {
    if (!effectFactories) return null;

    // On demand, not at module scope - see the note on the same import in
    // js/diagnostics/webgpuDiagnostic.js (Cycle 117 P4).
    const { CorralZapEffectPool } = await import('../effects/CorralZapEffect.js');
    const search = '?renderer=webgpu&webgpuEffects=1';
    const portal = new PortalEffect(sceneManager.scene, { x: -1.32, z: 0.18 }, -0.95, {
        search,
        webgpuEffectFactories: effectFactories,
    });
    portal.ring.scale.setScalar(0.12);
    portal.pad.scale.setScalar(0.12);
    portal.particles.scale.setScalar(0.08);
    portal.particles.position.set(-1.22, -0.86, 0.16);
    portal.ring.renderOrder = 4;
    portal.pad.renderOrder = 4;
    portal.particles.renderOrder = 4;
    portal.setIntensity(1);
    portal.pulse();
    portal.update(0.08);

    const zapPool = new CorralZapEffectPool(sceneManager.scene, {
        search,
        webgpuEffectFactories: effectFactories,
    });
    zapPool.fire({ x: 0.95, y: -0.96, z: 0.2 });
    zapPool.fireSpark({ x: 1.16, y: -0.48, z: 0.14 });
    zapPool.update(0.05);
    const firstZap = zapPool.effects[0] ?? null;
    if (firstZap) {
        firstZap.bolt.scale.setScalar(0.04);
        firstZap.particles.scale.setScalar(0.08);
        firstZap.particles.position.set(0.92, -0.84, 0.16);
        firstZap.bolt.renderOrder = 5;
        firstZap.particles.renderOrder = 5;
    }

    const summaries = {
        portalRing: portal.webgpuRingMaterialSummary ?? null,
        portalPad: portal.webgpuPadMaterialSummary ?? null,
        portalParticles: portal.webgpuParticleMaterialSummary ?? null,
        corralZapBolt: firstZap?.webgpuBoltMaterialSummary ?? null,
        corralZapParticles: firstZap?.webgpuParticleMaterialSummary ?? null,
    };
    const checks = {
        portalRingFactoryApplied: summaries.portalRing?.applied === true,
        portalPadFactoryApplied: summaries.portalPad?.applied === true,
        portalParticleFactoryApplied: summaries.portalParticles?.applied === true,
        zapBoltFactoryApplied: summaries.corralZapBolt?.applied === true,
        zapParticleFactoryApplied: summaries.corralZapParticles?.applied === true,
        portalRingNodeMaterial: portal.ringMaterial?.name === 'webgpu-node-portal-ring'
            && portal.ringMaterial?.isNodeMaterial === true,
        portalPadNodeMaterial: portal.pad?.material?.name === 'webgpu-node-portal-pad'
            && portal.pad?.material?.isNodeMaterial === true,
        portalParticleNodeMaterial: portal.particles?.material?.name === 'webgpu-node-portal-particles'
            && portal.particles?.material?.isNodeMaterial === true,
        zapBoltNodeMaterial: firstZap?.bolt?.material?.name === 'webgpu-node-corral-zap-bolt'
            && firstZap?.bolt?.material?.isNodeMaterial === true,
        zapParticleNodeMaterial: firstZap?.particles?.material?.name === 'webgpu-node-corral-zap-particles'
            && firstZap?.particles?.material?.isNodeMaterial === true,
        sceneContainsPortal: sceneManager.scene.children.includes(portal.ring)
            && sceneManager.scene.children.includes(portal.pad)
            && sceneManager.scene.children.includes(portal.particles),
        sceneContainsZap: sceneManager.scene.children.includes(firstZap?.bolt)
            && sceneManager.scene.children.includes(firstZap?.particles),
        portalControlsConnected: !!portal.ringMaterialControls?.update
            && !!portal.padMaterialControls?.update
            && !!portal.particleMaterialControls?.update,
        zapControlsConnected: !!firstZap?.boltMaterialControls?.update
            && !!firstZap?.particleMaterialControls?.update,
        zapActive: firstZap?.active === true,
        disposeCallable: typeof portal.dispose === 'function'
            && typeof zapPool.dispose === 'function',
    };

    return {
        dispose: () => {
            portal.dispose();
            zapPool.dispose();
        },
        proof: {
            source: 'scene-manager-production-portal-zap-webgpu-node-island',
            portal: {
                ringMaterialName: portal.ringMaterial?.name ?? null,
                padMaterialName: portal.pad?.material?.name ?? null,
                particleMaterialName: portal.particles?.material?.name ?? null,
                ringIsNodeMaterial: portal.ringMaterial?.isNodeMaterial === true,
                padIsNodeMaterial: portal.pad?.material?.isNodeMaterial === true,
                particleIsNodeMaterial: portal.particles?.material?.isNodeMaterial === true,
                summaries: {
                    ring: summaries.portalRing,
                    pad: summaries.portalPad,
                    particles: summaries.portalParticles,
                },
            },
            zap: {
                boltMaterialName: firstZap?.bolt?.material?.name ?? null,
                particleMaterialName: firstZap?.particles?.material?.name ?? null,
                boltIsNodeMaterial: firstZap?.bolt?.material?.isNodeMaterial === true,
                particleIsNodeMaterial: firstZap?.particles?.material?.isNodeMaterial === true,
                summaries: {
                    bolt: summaries.corralZapBolt,
                    particles: summaries.corralZapParticles,
                },
                poolSize: zapPool.effects.length,
                active: firstZap?.active === true,
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

async function createProductionTreeRockSceneManagerIsland({
    sceneManager,
    sceneBinding,
    webGpuModules,
    treeRockFactories,
}) {
    if (!treeRockFactories) return null;

    const preview = await createRuntimeGlbPreview({
        scene: sceneManager.scene,
        three: {
            Box3: webGpuModules.Box3 ?? THREE.Box3,
            InstancedMesh: webGpuModules.InstancedMesh ?? THREE.InstancedMesh,
            Matrix4: webGpuModules.Matrix4 ?? THREE.Matrix4,
            Object3D: webGpuModules.Object3D ?? THREE.Object3D,
            Vector3: webGpuModules.Vector3 ?? THREE.Vector3,
        },
        ...treeRockFactories,
    });

    const rendered = preview.rendered ?? [];
    const treeAssets = rendered.filter((asset) => asset.role === 'tree');
    const rockAssets = rendered.filter((asset) => asset.role === 'rock');
    const treeGroups = preview.productionInstancingPreview?.groups ?? [];
    const rockGroups = preview.diagnosticRockInstancingPreview?.groups ?? [];
    const treeMaterialNames = [...new Set(treeGroups.map((group) => group.materialName).filter(Boolean))].sort();
    const rockMaterialNames = [...new Set(rockGroups.map((group) => group.materialName).filter(Boolean))].sort();
    const expectedAssetPaths = RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => asset.path).sort();
    const renderedAssetPaths = rendered.map((asset) => asset.path).sort();
    const checks = {
        previewOk: preview.ok === true,
        adapterOk: preview.adapter?.ok === true,
        assetSetMatchesRuntimeContract: JSON.stringify(renderedAssetPaths) === JSON.stringify(expectedAssetPaths),
        allPreviewAssetsRendered: rendered.length === RUNTIME_GLB_RENDER_PREVIEW_ASSETS.length,
        treeAssetsCovered: treeAssets.length === 4
            && treeAssets.every((asset) => asset.replacement?.strategy === 'material-name')
            && treeAssets.every((asset) => asset.replacement?.missingTargets?.length === 0),
        rockAssetsCovered: rockAssets.length === 3
            && rockAssets.every((asset) => asset.replacement?.strategy === 'asset-class-traversal')
            && rockAssets.every((asset) => asset.replacement?.replacedMaterials > 0),
        treeNodeMaterialsBound: treeMaterialNames.includes('webgpu-node-branches')
            && treeMaterialNames.includes('webgpu-node-leaves'),
        rockNodeMaterialBound: rockMaterialNames.length === 1
            && rockMaterialNames[0] === 'webgpu-node-rock-rim',
        replacementCounts: preview.adapter?.treeReplacedMaterials === 8
            && preview.adapter?.rockReplacedMaterials === 3,
        productionTreePlacementPreview: preview.productionPlacementPreview?.ok === true
            && preview.productionPlacementPreview.source === 'shared/TreePlacement.generateTrees',
        productionTreeInstancingPreview: preview.productionInstancingPreview?.ok === true
            && preview.productionInstancingPreview.source === 'THREE.InstancedMesh'
            && preview.productionInstancingPreview.instancedMesh2Status === 'not imported in WebGPU diagnostic',
        diagnosticRockInstancingPreview: preview.diagnosticRockInstancingPreview?.ok === true
            && preview.diagnosticRockInstancingPreview.source === 'THREE.InstancedMesh'
            && preview.diagnosticRockInstancingPreview.instancedMesh2Status === 'not imported in WebGPU diagnostic',
        disposeCallable: typeof preview.dispose === 'function',
    };

    return {
        dispose: () => preview.dispose(),
        proof: {
            source: 'scene-manager-production-tree-rock-webgpu-node-island',
            sceneId: sceneBinding?.sceneId ?? null,
            expectedAssets: RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => ({
                key: asset.key,
                group: asset.group,
                role: asset.role,
                path: asset.path,
            })),
            adapter: preview.adapter ?? null,
            renderedAssets: rendered.map((asset) => ({
                key: asset.key,
                group: asset.group,
                role: asset.role,
                path: asset.path,
                replacement: asset.replacement,
                bounds: asset.bounds,
            })),
            materialNames: {
                trees: treeMaterialNames,
                rocks: rockMaterialNames,
            },
            productionPlacementPreview: preview.productionPlacementPreview ?? null,
            productionInstancingPreview: preview.productionInstancingPreview ?? null,
            diagnosticRockPlacementPreview: preview.diagnosticRockPlacementPreview ?? null,
            diagnosticRockInstancingPreview: preview.diagnosticRockInstancingPreview ?? null,
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createProductionAtmosphereSceneManagerIsland({
    sceneManager,
    webGpuModules,
    sceneBinding,
    skyFog,
    atmosphereFactories,
}) {
    if (!skyFog || !atmosphereFactories) return null;

    const summaries = {
        sky: null,
        cloud: null,
    };
    const search = '?renderer=webgpu&webgpuAtmosphere=1';
    const atmosphere = new Atmosphere(sceneManager.scene, {
        initialPreset: skyFog.presetName,
        sceneFog: sceneBinding?.fog ?? null,
        skyFactory: (context) => {
            const result = createWebGpuAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
                createDefaultMaterial: () => createFallbackNodeMaterial(
                    webGpuModules,
                    'webgpu-scene-manager-atmosphere-sky-fallback',
                    { side: webGpuModules.BackSide }
                ),
                search,
                factories: atmosphereFactories,
                context,
            });
            summaries.sky = result.summary ?? null;
            return result;
        },
        cloudFactory: (context) => {
            const result = createWebGpuAtmosphereMaterial('cloud-layer', 'createCloudLayerMaterial', {
                createDefaultMaterial: () => createFallbackNodeMaterial(
                    webGpuModules,
                    'webgpu-scene-manager-atmosphere-cloud-fallback',
                    { side: webGpuModules.DoubleSide, transparent: true }
                ),
                search,
                factories: atmosphereFactories,
                context,
            });
            summaries.cloud = result.summary ?? null;
            return result;
        },
    });

    atmosphere.syncCamera(sceneManager.camera.position);
    atmosphere.setTerrainYAtCamera(0);
    atmosphere.update(1 / 60);

    const skyMesh = atmosphere.sky.getMesh();
    const cloudMesh = atmosphere.cloudLayer?.getMesh?.() ?? null;
    const fogColor = roundedColorArray(atmosphere.fog?.color);
    const checks = {
        skyFactoryApplied: summaries.sky?.applied === true,
        cloudFactoryApplied: summaries.cloud?.applied === true,
        skyNodeMaterial: atmosphere.sky.material?.isNodeMaterial === true,
        cloudNodeMaterial: atmosphere.cloudLayer?.material?.isNodeMaterial === true,
        cloudControlsConnected: !!atmosphere.cloudLayer?.materialControls?.update,
        sceneContainsSky: sceneManager.scene.children.includes(skyMesh),
        sceneContainsCloud: !!cloudMesh && sceneManager.scene.children.includes(cloudMesh),
        fogColorMatchesPacket: arraysNear(fogColor, skyFog.fogColor),
        sceneFogMatchesBinding: !sceneBinding?.fog
            || (atmosphere.fog?.near === sceneBinding.fog.near
                && atmosphere.fog?.far === sceneBinding.fog.far),
        presetMatchesPacket: atmosphere.getCurrentPresetName() === skyFog.presetName,
    };

    return {
        dispose: () => atmosphere.dispose(),
        proof: {
            source: 'scene-manager-production-atmosphere-webgpu-node-island',
            sceneId: sceneBinding?.sceneId ?? null,
            presetName: skyFog.presetName,
            sky: {
                meshName: skyMesh.name,
                materialName: atmosphere.sky.material?.name ?? null,
                isNodeMaterial: atmosphere.sky.material?.isNodeMaterial === true,
                summary: summaries.sky,
            },
            cloud: {
                meshName: cloudMesh?.name ?? null,
                materialName: atmosphere.cloudLayer?.material?.name ?? null,
                isNodeMaterial: atmosphere.cloudLayer?.material?.isNodeMaterial === true,
                hasControls: !!atmosphere.cloudLayer?.materialControls,
                coverage: atmosphere.cloudLayer?.getCoverage?.() ?? null,
                visible: cloudMesh?.visible ?? null,
                summary: summaries.cloud,
            },
            fog: {
                kind: atmosphere.fog?.isFog ? 'Fog' : atmosphere.fog?.isFogExp2 ? 'FogExp2' : null,
                color: fogColor,
                near: atmosphere.fog?.near ?? null,
                far: atmosphere.fog?.far ?? null,
                density: atmosphere.fog?.density ?? null,
            },
            camera: {
                x: Number(sceneManager.camera.position.x.toFixed(2)),
                y: Number(sceneManager.camera.position.y.toFixed(2)),
                z: Number(sceneManager.camera.position.z.toFixed(2)),
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createFallbackNodeMaterial(webGpuModules, name, { side = null, transparent = false } = {}) {
    const { MeshBasicNodeMaterial, TSL } = webGpuModules;
    const material = new MeshBasicNodeMaterial();
    material.name = name;
    material.colorNode = TSL.vec4(0.08, 0.1, 0.12, transparent ? 0.45 : 1.0);
    material.transparent = transparent;
    material.depthWrite = !transparent;
    if (side !== null) material.side = side;
    return material;
}

function resolveHeightTextureScene(texture) {
    const sceneId = texture?.userData?.webgpuHeightfield?.sceneId ?? DEFAULT_SCENE_ID;
    return getSceneById(sceneId) ?? getSceneById(DEFAULT_SCENE_ID);
}

function createHeightfieldFromTexture(texture) {
    const meta = texture.userData?.webgpuHeightfield ?? {};
    const data = texture.image?.data;
    const heightfield = new Heightfield({
        data,
        width: meta.size?.[0] ?? texture.image?.width ?? 0,
        height: meta.size?.[1] ?? texture.image?.height ?? 0,
        worldSize: meta.worldSize ?? 1,
        peakHeight: meta.peakHeight ?? 1,
    });
    heightfield.sceneId = meta.sceneId ?? null;
    heightfield.source = meta.source ?? null;
    heightfield.waterY = meta.waterY ?? null;
    return heightfield;
}

function heightfieldMatchesTexture(heightfield, texture) {
    const meta = texture.userData?.webgpuHeightfield ?? {};
    return heightfield.width === meta.size?.[0]
        && heightfield.height === meta.size?.[1]
        && heightfield.worldSize === meta.worldSize
        && heightfield.peakHeight === meta.peakHeight;
}

function describeHeightfield(heightfield) {
    return {
        sceneId: heightfield.sceneId,
        source: heightfield.source,
        size: [heightfield.width, heightfield.height],
        worldSize: heightfield.worldSize,
        peakHeight: heightfield.peakHeight,
        waterY: heightfield.waterY,
        rawArrayType: heightfield.getRawArray()?.constructor?.name ?? null,
        rawArrayLength: heightfield.getRawArray()?.length ?? null,
        meshGridLength: heightfield.displacedHeights?.length ?? null,
    };
}

function countGeometryTriangles(geometry) {
    if (!geometry) return 0;
    if (geometry.index?.count) return Math.floor(geometry.index.count / 3);
    const positionCount = geometry.attributes?.position?.count ?? 0;
    return Math.floor(positionCount / 3);
}

function roundedColorArray(color) {
    if (!color) return null;
    return [color.r, color.g, color.b].map((value) => Number(value.toFixed(4)));
}

function arraysNear(a, b, epsilon = 0.015) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, index) => Math.abs(value - b[index]) <= epsilon);
}
