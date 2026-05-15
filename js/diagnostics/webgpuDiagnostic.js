import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './webgpuMaterialReplacement.js';
import * as THREE from 'three';
import {
    DEFAULT_SKY_FOG_SAMPLE_PRESET,
    createSkyFogSamplePacket,
} from '../atmosphere/skyFogSamplePacket.js';
import { isKnownPreset } from '../atmosphere/skyPresets.js';
import { Atmosphere } from '../atmosphere/Atmosphere.js';
import {
    createKonveyorAtmosphereMaterial,
} from '../atmosphere/konveyorAtmosphereMaterialAdapter.js';
import { DEFAULT_SCENE_ID, getSceneById } from '../../shared/scenes/index.js';
import { createRuntimeGlbMaterialReplacementProof } from './webgpuGlbMaterialProof.js';
import {
    RUNTIME_GLB_RENDER_PREVIEW_ASSETS,
    createRuntimeGlbPreview,
} from './webgpuRuntimeGlbPreview.js';
import {
    createKonveyorEffectMaterial,
} from '../effects/konveyorEffectMaterialAdapter.js';
import { CorralZapEffectPool } from '../effects/CorralZapEffect.js';
import { PortalEffect } from '../effects/PortalEffect.js';
import { SunBillboard } from '../effects/SunBillboard.js';
import { TerrainBuilder } from '../TerrainBuilder.js';
import { createAnimeWater } from '../water/AnimeWater.js';
import { GrassSystem } from '../GrassSystem.js';
import { OptimizedSheepSystem } from '../OptimizedSheep.js';
import {
    createKonveyorNodeMaterialFactorySuite,
    summarizeKonveyorNodeMaterialFactorySuite,
} from '../konveyorNodeMaterialFactorySuite.js';
import { geometryTriangleCount } from '../utils/TriangleCount.js';
import { Heightfield } from '../../shared/terrain/Heightfield.js';

const DIAGNOSTIC_WATER_PALETTE_RGB = Object.freeze({
    shallow: [0x6f, 0xd7, 0xd2],
    deep: [0x10, 0x36, 0x62],
    foam: [0xea, 0xf6, 0xff],
});

const DIAGNOSTIC_FOAM_THICKNESS = 2.5;
const DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE = Object.freeze({
    sceneId: 'rolling-hills',
    binUrl: '/terrain/rolling-hills.bin',
    manifestUrl: '/terrain/rolling-hills.bin.json',
    waterY: -0.05,
});

const DIAGNOSTIC_KILN_IMPOSTOR_SOURCE = Object.freeze({
    treeType: 'tree1',
    basePath: '/assets/models/trees/tree1.imposter',
});

const DIAGNOSTIC_KILN_VIEW_DIRECTION = Object.freeze([1, 0.3, 1]);
const DEFAULT_KILN_AZIMUTHS = Object.freeze([0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]);
const DEFAULT_KILN_ELEVATIONS = Object.freeze([
    85 * Math.PI / 180,
    60 * Math.PI / 180,
    30 * Math.PI / 180,
    5 * Math.PI / 180,
]);

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

function normalizeVector3([x, y, z]) {
    const length = Math.hypot(x, y, z);
    if (length < 0.0001) return [1, 0, 0];
    return [x / length, y / length, z / length];
}

function roundBlendWeight(value) {
    return Number(value.toFixed(4));
}

export function computeKilnDiagnosticTileBlend(sidecar = {}, viewDirection = DIAGNOSTIC_KILN_VIEW_DIRECTION) {
    const azimuths = sidecar.azimuths ?? DEFAULT_KILN_AZIMUTHS;
    const tilesX = sidecar.tilesX ?? azimuths.length;
    const elevations = sidecar.elevations ?? DEFAULT_KILN_ELEVATIONS;
    const [x, y, z] = normalizeVector3(viewDirection);
    const twoPi = Math.PI * 2;
    let azimuth = Math.atan2(z, x);
    if (azimuth < 0) azimuth += twoPi;
    const elevation = Math.max(0, Math.min(Math.PI * 0.5, Math.asin(Math.max(-1, Math.min(1, y)))));
    const azStep = twoPi / tilesX;
    const azFloat = azimuth / azStep;
    const azI = Math.floor(azFloat) % tilesX;
    const azI2 = (azI + 1) % tilesX;
    const u = azFloat - Math.floor(azFloat);

    let elJ = 2;
    let v = 1;
    if (elevation >= elevations[0]) {
        elJ = 0;
        v = 0;
    } else if (elevation >= elevations[1]) {
        elJ = 0;
        v = (elevations[0] - elevation) / (elevations[0] - elevations[1]);
    } else if (elevation >= elevations[2]) {
        elJ = 1;
        v = (elevations[1] - elevation) / (elevations[1] - elevations[2]);
    } else if (elevation >= elevations[3]) {
        elJ = 2;
        v = (elevations[2] - elevation) / (elevations[2] - elevations[3]);
    }

    if (u + v < 1) {
        return {
            tiles: [[azI, elJ], [azI2, elJ], [azI, elJ + 1]],
            weights: [roundBlendWeight(1 - u - v), roundBlendWeight(u), roundBlendWeight(v)],
        };
    }

    return {
        tiles: [[azI2, elJ], [azI2, elJ + 1], [azI, elJ + 1]],
        weights: [roundBlendWeight(1 - v), roundBlendWeight(u + v - 1), roundBlendWeight(1 - u)],
    };
}

function computeDiagnosticShorelineMetrics({
    x,
    z,
    centerX = 0,
    centerZ = 0,
    boundaryRadius,
    boundaryFalloff,
    foamThickness = DIAGNOSTIC_FOAM_THICKNESS,
}) {
    const falloff = Math.max(boundaryFalloff, 0.001);
    const radialDistance = Math.hypot(x - centerX, z - centerZ);
    const distanceFromShore = Math.abs(radialDistance - boundaryRadius);
    const depthT = clamp01(distanceFromShore / falloff);
    const foamMask = distanceFromShore < foamThickness ? 1 : 0;

    return {
        radialDistance,
        distanceFromShore,
        depthT,
        foamMask,
    };
}

function mixDiagnosticWaterBaseColor(depthT) {
    const t = clamp01(depthT);
    return DIAGNOSTIC_WATER_PALETTE_RGB.shallow.map((channel, index) => {
        const deep = DIAGNOSTIC_WATER_PALETTE_RGB.deep[index];
        return Math.round(channel + (deep - channel) * t);
    });
}

async function loadWebGpuThree() {
    const webGpuModulePath = './vendor/three/three.webgpu.min.js';
    return import(/* @vite-ignore */ new URL(webGpuModulePath, import.meta.url).href);
}

export function resolveDiagnosticScene(search = '') {
    const params = new URLSearchParams(search || '');
    const requestedSceneId = params.get('konveyorScene') || params.get('scene');

    if (!requestedSceneId) {
        return {
            active: false,
            requestedSceneId: null,
            sceneId: null,
            sceneName: null,
            skyPresetName: null,
            fog: null,
            fallbackReason: null,
        };
    }

    const sceneDef = getSceneById(requestedSceneId) ?? getSceneById(DEFAULT_SCENE_ID);

    return {
        active: true,
        requestedSceneId,
        sceneId: sceneDef.id,
        sceneName: sceneDef.name,
        skyPresetName: sceneDef.sky?.preset ?? DEFAULT_SKY_FOG_SAMPLE_PRESET,
        fog: sceneDef.fog ?? null,
        fallbackReason: sceneDef.id === requestedSceneId ? null : 'unknown-scene',
    };
}

export function resolveDiagnosticSkyPreset(search = '', defaultPresetName = DEFAULT_SKY_FOG_SAMPLE_PRESET) {
    const params = new URLSearchParams(search || '');
    const fallbackPresetName = isKnownPreset(defaultPresetName)
        ? defaultPresetName
        : DEFAULT_SKY_FOG_SAMPLE_PRESET;
    const requestedPresetName = params.get('konveyorSkyPreset') || fallbackPresetName;

    if (isKnownPreset(requestedPresetName)) {
        return {
            requestedPresetName,
            presetName: requestedPresetName,
            fallbackReason: null,
        };
    }

    return {
        requestedPresetName,
        presetName: DEFAULT_SKY_FOG_SAMPLE_PRESET,
        fallbackReason: 'unknown-preset',
    };
}

export function createSkyFogDiagnosticState(options = {}) {
    return createSkyFogSamplePacket(options);
}

export function createSceneBoundSkyFogDiagnosticState(sceneBinding) {
    if (!sceneBinding?.active) return createSkyFogDiagnosticState();

    return createSkyFogDiagnosticState({
        presetName: sceneBinding.skyPresetName ?? DEFAULT_SKY_FOG_SAMPLE_PRESET,
        fogDarkenMultiplier: sceneBinding.fog ? 1.0 : 0.82,
        fogNear: sceneBinding.fog?.near ?? 18,
        fogFar: sceneBinding.fog?.far ?? 74,
    });
}

function roundedColorArray(color) {
    if (!color?.toArray) return null;
    return color.toArray().slice(0, 3).map((value) => Number(value.toFixed(4)));
}

function arraysNear(a, b, tolerance = 0.0003) {
    return Array.isArray(a)
        && Array.isArray(b)
        && a.length === b.length
        && a.every((value, index) => Math.abs(value - b[index]) <= tolerance);
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

export function createProductionAtmosphereAdapterDiagnosticProof({
    scene,
    camera,
    sceneBinding,
    skyFog,
    atmosphereFactories,
    webGpuModules,
}) {
    const summaries = {
        sky: null,
        cloud: null,
    };
    const search = '?renderer=webgpu&konveyorAtmosphere=1';
    const atmosphere = new Atmosphere(scene, {
        initialPreset: skyFog.presetName,
        sceneFog: sceneBinding?.fog ?? null,
        skyFactory: (context) => {
            const result = createKonveyorAtmosphereMaterial('sky-dome', 'createSkyDomeMaterial', {
                createDefaultMaterial: () => createFallbackNodeMaterial(
                    webGpuModules,
                    'konveyor-production-atmosphere-sky-fallback',
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
            const result = createKonveyorAtmosphereMaterial('cloud-layer', 'createCloudLayerMaterial', {
                createDefaultMaterial: () => createFallbackNodeMaterial(
                    webGpuModules,
                    'konveyor-production-atmosphere-cloud-fallback',
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

    atmosphere.syncCamera(camera.position);
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
        sceneContainsSky: scene.children.includes(skyMesh),
        sceneContainsCloud: !!cloudMesh && scene.children.includes(cloudMesh),
        fogColorMatchesPacket: arraysNear(fogColor, skyFog.fogColor),
        presetMatchesPacket: atmosphere.getCurrentPresetName() === skyFog.presetName,
    };

    return {
        atmosphere,
        proof: {
            source: 'production-atmosphere-constructors-with-webgpu-node-factories',
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
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function createDiagnosticHeightfieldFromTexture(texture) {
    const meta = texture.userData?.konveyorHeightfield ?? {};
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
    heightfield.waterY = meta.waterY ?? DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.waterY;
    return heightfield;
}

export function createProductionWaterAdapterDiagnosticProof({
    scene,
    sceneBinding,
    heightTexture,
    waterFactories,
}) {
    const sourceScene = getSceneById(DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.sceneId)
        ?? getSceneById(DEFAULT_SCENE_ID);
    const boundary = sourceScene?.boundary?.kind === 'island'
        ? sourceScene.boundary
        : { kind: 'island', center: { x: 0, z: 0 }, radius: 180, falloff: 40 };
    const heightfield = createDiagnosticHeightfieldFromTexture(heightTexture);
    const water = createAnimeWater({
        boundary,
        heightfield,
        size: 2.0,
        y: -1.19,
        segments: 4,
        search: '?renderer=webgpu&konveyorWater=1',
        konveyorWaterFactories: waterFactories,
    });

    water.mesh.position.z = 0.11;
    water.mesh.frustumCulled = false;
    water.mesh.renderOrder = 2;
    scene.add(water.mesh);
    water.update(1.25);

    const summary = water.konveyorWaterMaterialSummary ?? water.material.userData?.konveyorWaterMaterialSummary ?? null;
    const productionHeightTexture = water.material.userData?.heightTexture ?? null;
    const checks = {
        factoryApplied: summary?.applied === true,
        nodeMaterial: water.material?.name === 'konveyor-node-anime-water'
            && water.material?.isNodeMaterial === true,
        meshPresent: scene.children.includes(water.mesh),
        meshIsWaterPlane: water.mesh?.isMesh === true
            && water.mesh?.geometry?.type === 'PlaneGeometry',
        productionHeightTexture: productionHeightTexture?.isDataTexture === true,
        sourceHeightfieldMatchesTexture: heightfield.width === heightTexture.userData.konveyorHeightfield.size[0]
            && heightfield.height === heightTexture.userData.konveyorHeightfield.size[1]
            && heightfield.worldSize === heightTexture.userData.konveyorHeightfield.worldSize
            && heightfield.peakHeight === heightTexture.userData.konveyorHeightfield.peakHeight,
        updateCallable: typeof water.update === 'function',
        disposeCallable: typeof water.dispose === 'function',
    };

    return {
        water,
        proof: {
            source: 'production-anime-water-constructor-with-webgpu-node-factory',
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
                frustumCulled: water.mesh?.frustumCulled ?? null,
            },
            boundary: {
                kind: boundary.kind,
                center: [boundary.center?.x ?? 0, boundary.center?.z ?? 0],
                radius: boundary.radius,
                falloff: boundary.falloff,
            },
            heightfield: {
                sceneId: heightfield.sceneId,
                source: heightfield.source,
                size: [heightfield.width, heightfield.height],
                worldSize: heightfield.worldSize,
                peakHeight: heightfield.peakHeight,
                waterY: heightfield.waterY,
                rawArrayType: heightfield.getRawArray()?.constructor?.name ?? null,
                rawArrayLength: heightfield.getRawArray()?.length ?? null,
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

export function createProductionTerrainAdapterDiagnosticProof({
    scene,
    sceneBinding,
    heightTexture,
    terrainFactories,
}) {
    const sourceScene = getSceneById(DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.sceneId)
        ?? getSceneById(DEFAULT_SCENE_ID);
    const heightfield = createDiagnosticHeightfieldFromTexture(heightTexture);
    const builder = new TerrainBuilder(scene, true, sourceScene, {
        search: '?renderer=webgpu&konveyorTerrain=1',
        konveyorTerrainFactories: terrainFactories,
    });
    builder.setHeightfield(heightfield);
    const terrain = builder.createTerrain();
    terrain.position.set(0.0, -1.235, 0.14);
    terrain.scale.setScalar(0.00045);
    terrain.frustumCulled = false;
    terrain.renderOrder = 1;

    const summary = builder.konveyorTerrainMaterialSummary ?? terrain.material.userData?.konveyorTerrainMaterialSummary ?? null;
    const productionHeightTexture = terrain.material.userData?.heightTexture ?? null;
    const checks = {
        factoryApplied: summary?.applied === true,
        nodeMaterial: terrain.material?.name === 'konveyor-node-terrain-heightfield'
            && terrain.material?.isNodeMaterial === true,
        sceneContainsTerrain: scene.children.includes(terrain),
        meshIsTerrainPlane: terrain?.isMesh === true
            && terrain?.geometry?.type === 'PlaneGeometry',
        productionHeightTexture: productionHeightTexture?.isDataTexture === true,
        sourceHeightfieldMatchesTexture: heightfield.width === heightTexture.userData.konveyorHeightfield.size[0]
            && heightfield.height === heightTexture.userData.konveyorHeightfield.size[1]
            && heightfield.worldSize === heightTexture.userData.konveyorHeightfield.worldSize
            && heightfield.peakHeight === heightTexture.userData.konveyorHeightfield.peakHeight,
        meshGridBound: heightfield.displacedHeights?.length === terrain.geometry.attributes.position.count,
        disposeCallable: typeof builder.dispose === 'function',
    };

    return {
        builder,
        terrain,
        proof: {
            source: 'production-terrainbuilder-create-terrain-with-webgpu-node-factory',
            sceneId: sceneBinding?.sceneId ?? null,
            terrainSourceSceneId: sourceScene?.id ?? null,
            materialName: terrain.material?.name ?? null,
            isNodeMaterial: terrain.material?.isNodeMaterial === true,
            summary,
            mesh: {
                name: terrain.name ?? '',
                geometryType: terrain.geometry?.type ?? null,
                vertices: terrain.geometry?.attributes?.position?.count ?? null,
                size: 3200,
                segments: 256,
                scale: terrain.scale?.x ?? null,
                frustumCulled: terrain.frustumCulled ?? null,
            },
            heightfield: {
                sceneId: heightfield.sceneId,
                source: heightfield.source,
                size: [heightfield.width, heightfield.height],
                worldSize: heightfield.worldSize,
                peakHeight: heightfield.peakHeight,
                waterY: heightfield.waterY,
                rawArrayType: heightfield.getRawArray()?.constructor?.name ?? null,
                rawArrayLength: heightfield.getRawArray()?.length ?? null,
                meshGridLength: heightfield.displacedHeights?.length ?? null,
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

export function createProductionGrassAdapterDiagnosticProof({
    scene,
    sceneBinding,
    heightTexture,
    grassFactories,
    three = null,
}) {
    const sourceScene = getSceneById(DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.sceneId)
        ?? getSceneById(DEFAULT_SCENE_ID);
    const heightfield = createDiagnosticHeightfieldFromTexture(heightTexture);
    heightfield.bakeMeshGrid({ segments: 256, size: 3200 });
    const grass = new GrassSystem(scene, false, sourceScene?.grass ?? null, heightfield, sourceScene?.boundary ?? null, {
        search: '?renderer=webgpu&konveyorGrass=1',
        konveyorGrassFactories: grassFactories,
    });

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
        grass.chunks.set('diagnostic-blade', bladeChunk);
        bladeChunk.mesh.position.set(1.62, -1.08, 0.24);
        bladeChunk.mesh.scale.setScalar(0.055);
        bladeChunk.mesh.frustumCulled = false;
        bladeChunk.mesh.renderOrder = 3;
    }

    const meadowMaterial = grass.createMeadowQuadMaterial();
    let meadowMesh = null;
    if (three?.Mesh && three?.PlaneGeometry) {
        meadowMesh = new three.Mesh(new three.PlaneGeometry(1.1, 0.48, 1, 1), meadowMaterial);
        meadowMesh.position.set(1.46, -0.58, 0.11);
        meadowMesh.frustumCulled = false;
        meadowMesh.renderOrder = 2;
        scene.add(meadowMesh);
    }

    const bladeSummary = grass.konveyorGrassBladeMaterialSummary ?? grass.grassMaterial?.userData?.konveyorGrassBladeMaterialSummary ?? null;
    const meadowSummary = grass.konveyorMeadowQuadMaterialSummary ?? null;
    const bladeData = grass.clumpGeometry?.attributes?.bladeData ?? null;
    const checks = {
        bladeFactoryApplied: bladeSummary?.applied === true,
        meadowFactoryApplied: meadowSummary?.applied === true,
        bladeNodeMaterial: grass.grassMaterial?.name === 'konveyor-node-grass-blade'
            && grass.grassMaterial?.isNodeMaterial === true,
        meadowNodeMaterial: meadowMaterial?.name === 'konveyor-node-meadow-quad'
            && meadowMaterial?.isNodeMaterial === true,
        clumpGeometryBound: grass.clumpGeometry?.type === 'BufferGeometry'
            && grass.clumpGeometry?.attributes?.position?.count === grass.config.bladesPerClump * 4
            && bladeData?.itemSize === 4,
        bladeChunkInstanced: bladeChunk?.mesh?.isInstancedMesh === true
            && bladeChunk.mesh.count > 0
            && bladeChunk.mesh.count <= 12
            && scene.children.includes(bladeChunk.mesh),
        sourceHeightfieldMatchesTexture: heightfield.width === heightTexture.userData.konveyorHeightfield.size[0]
            && heightfield.height === heightTexture.userData.konveyorHeightfield.size[1]
            && heightfield.worldSize === heightTexture.userData.konveyorHeightfield.worldSize
            && heightfield.peakHeight === heightTexture.userData.konveyorHeightfield.peakHeight,
        meshGridBound: heightfield.displacedHeights?.length === 66049,
        disposeCallable: typeof grass.dispose === 'function',
    };

    const dispose = () => {
        if (meadowMesh) {
            scene.remove(meadowMesh);
            meadowMesh.geometry?.dispose?.();
            meadowMesh = null;
        }
        meadowMaterial?.dispose?.();
        grass.dispose();
    };

    return {
        grass,
        bladeChunk,
        meadowMaterial,
        meadowMesh,
        dispose,
        proof: {
            source: 'production-grasssystem-material-and-chunk-constructors-with-webgpu-node-factories',
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
                meshPresent: !!meadowMesh && scene.children.includes(meadowMesh),
            },
            geometry: {
                bladesPerClump: grass.config.bladesPerClump,
                vertices: grass.clumpGeometry?.attributes?.position?.count ?? null,
                triangles: grass.clumpGeometry?.index?.count
                    ? grass.clumpGeometry.index.count / 3
                    : null,
                bladeDataItemSize: bladeData?.itemSize ?? null,
                bladeDataCount: bladeData?.count ?? null,
            },
            chunk: {
                isInstancedMesh: bladeChunk?.mesh?.isInstancedMesh === true,
                instanceCount: bladeChunk?.mesh?.count ?? null,
                fullCount: bladeChunk?.fullCount ?? null,
                clumpCount: bladeChunk?.clumpCount ?? null,
                frustumCulled: bladeChunk?.mesh?.frustumCulled ?? null,
                scale: bladeChunk?.mesh?.scale?.x ?? null,
            },
            heightfield: {
                sceneId: heightfield.sceneId,
                source: heightfield.source,
                size: [heightfield.width, heightfield.height],
                worldSize: heightfield.worldSize,
                peakHeight: heightfield.peakHeight,
                waterY: heightfield.waterY,
                rawArrayType: heightfield.getRawArray()?.constructor?.name ?? null,
                rawArrayLength: heightfield.getRawArray()?.length ?? null,
                meshGridLength: heightfield.displacedHeights?.length ?? null,
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

export function createProductionSheepAdapterDiagnosticProof({
    scene,
    sceneBinding,
    sheepFactories,
}) {
    const sheep = new OptimizedSheepSystem(scene, 3, {
        centerX: 0,
        centerZ: 0,
        spreadRadius: 1.2,
        defaultCount: 3,
    }, false, {
        search: '?renderer=webgpu&konveyorSheep=1',
        konveyorSheepFactories: sheepFactories,
    });

    if (sheep.instancedMesh) {
        sheep.instancedMesh.position.set(-1.52, -1.16, 0.54);
        sheep.instancedMesh.scale.setScalar(0.18);
        sheep.instancedMesh.frustumCulled = false;
        sheep.instancedMesh.renderOrder = 4;
    }

    const summary = sheep.konveyorSheepMaterialSummary ?? sheep.material?.userData?.konveyorSheepMaterialSummary ?? null;
    const attributes = Object.keys(sheep.mergedGeometry?.attributes ?? {});
    const checks = {
        factoryApplied: summary?.applied === true,
        nodeMaterial: sheep.material?.name === 'konveyor-node-sheep-wool'
            && sheep.material?.isNodeMaterial === true,
        instancedMeshPresent: sheep.instancedMesh?.isInstancedMesh === true
            && sheep.instancedMesh.count === 3
            && scene.children.includes(sheep.instancedMesh),
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
        sheep,
        proof: {
            source: 'production-optimizedsheepsystem-constructor-with-webgpu-node-factory',
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

export function createProductionTreeRockAdapterDiagnosticProof({
    sceneBinding,
    runtimeGlbPreview,
}) {
    const rendered = runtimeGlbPreview?.rendered ?? [];
    const treeAssets = rendered.filter((asset) => asset.role === 'tree');
    const rockAssets = rendered.filter((asset) => asset.role === 'rock');
    const treeGroups = runtimeGlbPreview?.productionInstancingPreview?.groups ?? [];
    const rockGroups = runtimeGlbPreview?.diagnosticRockInstancingPreview?.groups ?? [];
    const expectedMaterialNames = {
        treeBranches: 'konveyor-node-branches',
        treeLeaves: 'konveyor-node-leaves',
        rock: 'konveyor-node-rock-rim',
    };
    const treeMaterialNames = [...new Set(treeGroups.map((group) => group.materialName).filter(Boolean))].sort();
    const rockMaterialNames = [...new Set(rockGroups.map((group) => group.materialName).filter(Boolean))].sort();
    const expectedAssetPaths = RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => asset.path).sort();
    const renderedAssetPaths = rendered.map((asset) => asset.path).sort();
    const checks = {
        runtimePreviewOk: runtimeGlbPreview?.ok === true,
        adapterOk: runtimeGlbPreview?.adapter?.ok === true,
        assetSetMatchesRuntimeContract: JSON.stringify(renderedAssetPaths) === JSON.stringify(expectedAssetPaths),
        allPreviewAssetsRendered: rendered.length === RUNTIME_GLB_RENDER_PREVIEW_ASSETS.length,
        treeAssetsCovered: treeAssets.length === 4
            && treeAssets.every((asset) => asset.replacement?.strategy === 'material-name')
            && treeAssets.every((asset) => asset.replacement?.missingTargets?.length === 0),
        rockAssetsCovered: rockAssets.length === 3
            && rockAssets.every((asset) => asset.replacement?.strategy === 'asset-class-traversal')
            && rockAssets.every((asset) => asset.replacement?.replacedMaterials > 0),
        treeNodeMaterialsBound: treeMaterialNames.includes(expectedMaterialNames.treeBranches)
            && treeMaterialNames.includes(expectedMaterialNames.treeLeaves),
        rockNodeMaterialBound: rockMaterialNames.length === 1
            && rockMaterialNames[0] === expectedMaterialNames.rock,
        replacementCounts: runtimeGlbPreview?.adapter?.treeReplacedMaterials === 8
            && runtimeGlbPreview?.adapter?.rockReplacedMaterials === 3,
        productionTreePlacementPreview: runtimeGlbPreview?.productionPlacementPreview?.ok === true
            && runtimeGlbPreview.productionPlacementPreview.source === 'shared/TreePlacement.generateTrees',
        productionTreeInstancingPreview: runtimeGlbPreview?.productionInstancingPreview?.ok === true
            && runtimeGlbPreview.productionInstancingPreview.source === 'THREE.InstancedMesh'
            && runtimeGlbPreview.productionInstancingPreview.instancedMesh2Status === 'not imported in WebGPU diagnostic',
        diagnosticRockInstancingPreview: runtimeGlbPreview?.diagnosticRockInstancingPreview?.ok === true
            && runtimeGlbPreview.diagnosticRockInstancingPreview.source === 'THREE.InstancedMesh'
            && runtimeGlbPreview.diagnosticRockInstancingPreview.instancedMesh2Status === 'not imported in WebGPU diagnostic',
    };

    return {
        proof: {
            source: 'shipped-tree-rock-glbs-with-production-material-adapter-and-native-instancing-preview',
            sceneId: sceneBinding?.sceneId ?? null,
            expectedMaterialNames,
            expectedAssets: RUNTIME_GLB_RENDER_PREVIEW_ASSETS.map((asset) => ({
                key: asset.key,
                group: asset.group,
                role: asset.role,
                path: asset.path,
            })),
            adapter: runtimeGlbPreview?.adapter ?? null,
            renderedAssets: rendered.map((asset) => ({
                key: asset.key,
                group: asset.group,
                role: asset.role,
                path: asset.path,
                replacement: asset.replacement,
                bounds: asset.bounds,
            })),
            productionPlacementPreview: runtimeGlbPreview?.productionPlacementPreview ?? null,
            productionInstancingPreview: runtimeGlbPreview?.productionInstancingPreview ?? null,
            diagnosticRockPlacementPreview: runtimeGlbPreview?.diagnosticRockPlacementPreview ?? null,
            diagnosticRockInstancingPreview: runtimeGlbPreview?.diagnosticRockInstancingPreview ?? null,
            materialNames: {
                trees: treeMaterialNames,
                rocks: rockMaterialNames,
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

function summarizeMaterial(material) {
    return {
        materialName: material?.name ?? null,
        isNodeMaterial: material?.isNodeMaterial === true,
        transparent: material?.transparent === true,
        depthWrite: material?.depthWrite ?? null,
        hasOpacityNode: !!material?.opacityNode,
        hasColorNode: !!material?.colorNode,
    };
}

export function createProductionEffectAdapterDiagnosticProof({
    scene,
    camera,
    sceneBinding,
    skyFog,
    effectFactories,
}) {
    const search = '?renderer=webgpu&konveyorEffects=1';
    const sun = new SunBillboard(scene, {
        distance: 2.2,
        size: 0.42,
        search,
        konveyorEffectFactories: effectFactories,
    });
    sun.update(
        camera,
        new THREE.Vector3(...(skyFog?.sunDirection ?? [0, 1, 0])),
        new THREE.Color(...(skyFog?.sunColor ?? [1, 0.92, 0.72]))
    );
    const portal = new PortalEffect(scene, { x: -0.45, z: 0.18 }, -1.02, {
        search,
        konveyorEffectFactories: effectFactories,
    });
    portal.setIntensity(1);
    portal.pulse();
    portal.update(0.08);

    const zapPool = new CorralZapEffectPool(scene, {
        search,
        konveyorEffectFactories: effectFactories,
    });
    zapPool.fire({ x: 0.62, y: -1.0, z: 0.18 });
    zapPool.fireSpark({ x: 0.92, y: 0.45, z: 0.12 });
    zapPool.update(0.05);
    const firstZap = zapPool.effects[0] ?? null;

    const summaries = {
        sun: sun.konveyorMaterialSummary,
        portalRing: portal.konveyorRingMaterialSummary,
        portalPad: portal.konveyorPadMaterialSummary,
        portalParticles: portal.konveyorParticleMaterialSummary,
        corralZapBolt: firstZap?.konveyorBoltMaterialSummary ?? null,
        corralZapParticles: firstZap?.konveyorParticleMaterialSummary ?? null,
    };
    const materialNames = {
        sun: 'konveyor-node-sun-billboard',
        portalRing: 'konveyor-node-portal-ring',
        portalPad: 'konveyor-node-portal-pad',
        portalParticles: 'konveyor-node-portal-particles',
        corralZapBolt: 'konveyor-node-corral-zap-bolt',
        corralZapParticles: 'konveyor-node-corral-zap-particles',
    };
    const checks = {
        sunFactoryApplied: summaries.sun?.applied === true,
        portalRingFactoryApplied: summaries.portalRing?.applied === true,
        portalPadFactoryApplied: summaries.portalPad?.applied === true,
        portalParticleFactoryApplied: summaries.portalParticles?.applied === true,
        zapBoltFactoryApplied: summaries.corralZapBolt?.applied === true,
        zapParticleFactoryApplied: summaries.corralZapParticles?.applied === true,
        sunNodeMaterial: sun.material?.name === materialNames.sun && sun.material?.isNodeMaterial === true,
        portalRingNodeMaterial: portal.ringMaterial?.name === materialNames.portalRing && portal.ringMaterial?.isNodeMaterial === true,
        portalPadNodeMaterial: portal.pad?.material?.name === materialNames.portalPad && portal.pad?.material?.isNodeMaterial === true,
        portalParticleNodeMaterial: portal.particles?.material?.name === materialNames.portalParticles && portal.particles?.material?.isNodeMaterial === true,
        zapBoltNodeMaterial: firstZap?.bolt?.material?.name === materialNames.corralZapBolt && firstZap?.bolt?.material?.isNodeMaterial === true,
        zapParticleNodeMaterial: firstZap?.particles?.material?.name === materialNames.corralZapParticles && firstZap?.particles?.material?.isNodeMaterial === true,
        sceneContainsSun: scene.children.includes(sun.mesh),
        sceneContainsPortal: scene.children.includes(portal.ring)
            && scene.children.includes(portal.pad)
            && scene.children.includes(portal.particles),
        sceneContainsZap: !!firstZap
            && scene.children.includes(firstZap.bolt)
            && scene.children.includes(firstZap.particles),
        portalControlsConnected: !!portal.ringMaterialControls?.update
            && !!portal.padMaterialControls?.update
            && !!portal.particleMaterialControls?.update,
        zapControlsConnected: !!firstZap?.boltMaterialControls?.update
            && !!firstZap?.particleMaterialControls?.update,
        zapPoolInitialized: zapPool.effects.length === 8,
        zapEffectActivated: zapPool.effects.some((effect) => effect.active),
    };

    const dispose = () => {
        sun.dispose();
        portal.dispose();
        zapPool.dispose();
    };

    return {
        sun,
        portal,
        zapPool,
        dispose,
        proof: {
            source: 'production-effect-constructors-with-webgpu-node-factories',
            sceneId: sceneBinding?.sceneId ?? null,
            expectedMaterialNames: materialNames,
            sun: {
                ...summarizeMaterial(sun.material),
                summary: summaries.sun,
                hasControls: !!sun.materialControls?.update,
            },
            portal: {
                ring: {
                    ...summarizeMaterial(portal.ringMaterial),
                    summary: summaries.portalRing,
                    hasControls: !!portal.ringMaterialControls?.update,
                },
                pad: {
                    ...summarizeMaterial(portal.pad?.material),
                    summary: summaries.portalPad,
                    hasControls: !!portal.padMaterialControls?.update,
                },
                particles: {
                    ...summarizeMaterial(portal.particles?.material),
                    summary: summaries.portalParticles,
                    hasControls: !!portal.particleMaterialControls?.update,
                },
            },
            corralZap: {
                poolSize: zapPool.effects.length,
                activeEffects: zapPool.effects.filter((effect) => effect.active).length,
                bolt: {
                    ...summarizeMaterial(firstZap?.bolt?.material),
                    summary: summaries.corralZapBolt,
                    hasControls: !!firstZap?.boltMaterialControls?.update,
                },
                particles: {
                    ...summarizeMaterial(firstZap?.particles?.material),
                    summary: summaries.corralZapParticles,
                    hasControls: !!firstZap?.particleMaterialControls?.update,
                },
            },
            checks,
            ok: Object.values(checks).every(Boolean),
        },
    };
}

export function createRockRimDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    return {
        baseColor: [0.34, 0.32, 0.27],
        rimColor: skyFog.sunColor,
        rimStrength: 0.48,
        rimPower: 2.0,
        sunColorSource: 'skyFog.sunColor',
    };
}

export function createMeadowQuadDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    return {
        source: 'GrassSystem.createMeadowQuadMaterial',
        baseColor: [0.08, 0.28, 0.04],
        midColor: [0.18, 0.48, 0.12],
        tipColor: [0.55, 0.82, 0.30],
        uvCellsPerChunk: 5.0,
        noiseHashVector: [127.1, 311.7],
        noiseOctaves: [1, 2],
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        fogStrength: 0.55,
        farRingLod: 'meadow-quad',
    };
}

function normalizedRgb(rgb) {
    return rgb.map((channel) => Number((channel / 255).toFixed(4)));
}

export function createAnimeWaterDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    const nearShoreMetrics = computeDiagnosticShorelineMetrics({
        x: 0,
        z: 0,
        boundaryRadius: 0,
        boundaryFalloff: 12,
        foamThickness: DIAGNOSTIC_FOAM_THICKNESS,
    });
    const farWaterMetrics = computeDiagnosticShorelineMetrics({
        x: 12,
        z: 0,
        boundaryRadius: 0,
        boundaryFalloff: 12,
        foamThickness: DIAGNOSTIC_FOAM_THICKNESS,
    });

    return {
        shallowColor: normalizedRgb(DIAGNOSTIC_WATER_PALETTE_RGB.shallow),
        deepColor: normalizedRgb(DIAGNOSTIC_WATER_PALETTE_RGB.deep),
        foamColor: normalizedRgb(DIAGNOSTIC_WATER_PALETTE_RGB.foam),
        nearShoreColor: normalizedRgb(mixDiagnosticWaterBaseColor(nearShoreMetrics.depthT)),
        farWaterColor: normalizedRgb(mixDiagnosticWaterBaseColor(farWaterMetrics.depthT)),
        fogColor: skyFog.fogColor,
        sunColor: skyFog.sunColor,
        sunDirection: skyFog.sunDirection,
        foamThickness: DIAGNOSTIC_FOAM_THICKNESS,
        heightfieldTexture: {
            sceneId: DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.sceneId,
            source: DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.binUrl,
            format: 'RedFormat/FloatType',
            size: [1024, 1024],
            sampler: 'nearest-clamp',
            worldSize: 500,
            peakHeight: 6,
            waterY: DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.waterY,
        },
        rippleStrength: 1.0,
        sparkleStrength: 0.7,
        heightfieldSampling: 'diagnostic-data-texture',
    };
}

export function createTerrainHeightfieldDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    return {
        source: DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.binUrl,
        sceneId: DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.sceneId,
        size: [1024, 1024],
        worldSize: 500,
        peakHeight: 6,
        lowColor: [0.29, 0.38, 0.18],
        midColor: [0.43, 0.55, 0.25],
        highColor: [0.56, 0.53, 0.42],
        fogColor: skyFog.fogColor,
        heightfieldSampling: 'diagnostic-data-texture',
    };
}

export function createTreeLeafDiagnosticState() {
    return {
        baseColor: [0.18, 0.34, 0.12],
        tipColor: [0.50, 0.68, 0.24],
        windDirection: [0.7, 0.7],
        windStrength: 0.72,
        treeBaseY: -0.525,
        treeTopY: 0.525,
        alphaHash: true,
        alphaTest: 0.08,
        occluderStrength: 0.55,
        occluderPeak: 0.62,
        occluderUv: [0.5, 0.42],
    };
}

export function createGrassBladeDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    return {
        baseColor: [0.08, 0.28, 0.04],
        midColor: [0.18, 0.48, 0.12],
        tipColor: [0.55, 0.82, 0.30],
        windDirection: [0.7, 0.7],
        windStrength: 0.12,
        windSpeed: 0.6,
        gustStrength: 0.05,
        bladeHeight: 1.0,
        grassFadeStart: 70,
        grassFadeEnd: 260,
        distanceFadeStrength: 1.0,
        sunColor: skyFog.sunColor,
        sunDirection: skyFog.sunDirection,
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        alphaHash: true,
        alphaTest: 0.06,
        interaction: 'deferred',
        distanceFade: 'diagnostic-smooth-opacity-proxy',
        productionDistanceFade: 'GrassSystem stochastic blade dither',
        source: 'GrassSystem.shader-contract',
    };
}

export function createSheepWoolDiagnosticState(skyFog = createSkyFogDiagnosticState()) {
    return {
        bodyColor: [1.0, 1.0, 1.0],
        faceColor: [0.22, 0.20, 0.18],
        hoofColor: [0.16, 0.16, 0.16],
        rimColor: [1.0, 1.0, 1.0],
        sssColor: [1.0, 1.0, 0.98],
        lightDirection: [0.3, 1.0, 0.5],
        woolNoiseScale: 6.0,
        woolDisplacementStrength: 0.045,
        breathingStrength: 0.012,
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        instancing: 'deferred',
        animationAttributes: ['instanceData', 'instanceAnimation', 'vertexId'],
        source: 'OptimizedSheep.shader-contract',
    };
}

export function createKilnImpostorDiagnosticState(skyFog = createSkyFogDiagnosticState(), sidecar = null) {
    const tileBlend = computeKilnDiagnosticTileBlend(sidecar ?? {});
    return {
        treeType: DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.treeType,
        basePath: DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath,
        atlas: `${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.png`,
        normal: `${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.normal.png`,
        depth: `${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.depth.png`,
        sidecar: `${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.json`,
        tilesX: sidecar?.tilesX ?? 4,
        tilesY: sidecar?.tilesY ?? 4,
        tileSize: sidecar?.tileSize ?? 512,
        atlasSize: [sidecar?.atlasWidth ?? 2048, sidecar?.atlasHeight ?? 2048],
        worldSize: sidecar?.worldSize ?? 1,
        yOffset: sidecar?.yOffset ?? 0.5,
        colorLayer: sidecar?.colorLayer ?? 'baseColor',
        normalSpace: sidecar?.normalSpace ?? 'capture-view',
        auxLayers: sidecar?.auxLayers ?? ['albedo', 'normal', 'depth'],
        edgeBleedPx: sidecar?.edgeBleedPx ?? 2,
        alphaTest: 0.3,
        alphaHashScale: 0.3,
        sunColor: skyFog.sunColor,
        sunDirection: skyFog.sunDirection,
        ambientColor: [0.55, 0.55, 0.58],
        diagnosticViewDirection: [...DIAGNOSTIC_KILN_VIEW_DIRECTION],
        tileBlendTiles: tileBlend.tiles,
        tileBlendWeights: tileBlend.weights,
        fogColor: skyFog.fogColor,
        fogNear: skyFog.fogNear,
        fogFar: skyFog.fogFar,
        atlasSampling: 'three-tile-albedo-normal',
        tileBlend: 'view-derived-three-tile-premultiplied',
        viewDrivenTileSelection: 'cpu-diagnostic-sample',
        relighting: 'single-tile-normal-aux',
        depthAuxUse: 'rgba-depth-sample-shading-proxy',
        depthAuxPacking: 'RGBADepthPacking',
        parallax: 'deferred',
        depthDiscard: 'deferred',
        productionLod: 'deferred',
        source: 'Kiln.impostor-sidecar-contract',
    };
}

async function createDiagnosticHeightTexture({
    DataTexture,
    RedFormat,
    FloatType,
    NearestFilter,
    ClampToEdgeWrapping,
}) {
    const [manifestResponse, binResponse] = await Promise.all([
        fetch(DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.manifestUrl),
        fetch(DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.binUrl),
    ]);
    if (!manifestResponse.ok || !binResponse.ok) {
        throw new Error('diagnostic heightfield fetch failed');
    }
    const manifest = await manifestResponse.json();
    const buffer = await binResponse.arrayBuffer();
    const data = new Float32Array(buffer);
    if (data.length !== manifest.width * manifest.height) {
        throw new Error('diagnostic heightfield byte count mismatch');
    }
    const texture = new DataTexture(data, manifest.width, manifest.height, RedFormat, FloatType);
    texture.magFilter = NearestFilter;
    texture.minFilter = NearestFilter;
    texture.wrapS = ClampToEdgeWrapping;
    texture.wrapT = ClampToEdgeWrapping;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    texture.userData.konveyorHeightfield = {
        sceneId: manifest.scene ?? DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.sceneId,
        source: DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.binUrl,
        format: 'RedFormat/FloatType',
        size: [manifest.width, manifest.height],
        sampler: 'nearest-clamp',
        worldSize: manifest.worldSize,
        peakHeight: manifest.peakHeight,
        waterY: DIAGNOSTIC_WATER_HEIGHTFIELD_SOURCE.waterY,
    };
    return texture;
}

async function createDiagnosticKilnImpostorAssets({
    TextureLoader,
    LinearFilter,
    ClampToEdgeWrapping,
    SRGBColorSpace,
    NoColorSpace,
}) {
    const sidecarResponse = await fetch(`${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.json`);
    if (!sidecarResponse.ok) {
        throw new Error('diagnostic kiln impostor sidecar fetch failed');
    }
    const sidecar = await sidecarResponse.json();
    const loader = new TextureLoader();
    const loadTexture = (url, colorSpace) => new Promise((resolve, reject) => {
        loader.load(
            url,
            (texture) => {
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
        loadTexture(`${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.png`, SRGBColorSpace),
        loadTexture(`${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.normal.png`, NoColorSpace),
        loadTexture(`${DIAGNOSTIC_KILN_IMPOSTOR_SOURCE.basePath}.depth.png`, NoColorSpace),
    ]);
    return { sidecar, albedoAtlas, normalAtlas, depthAtlas };
}

function syncDiagnosticHeightfieldState(target, heightfield) {
    target.source = heightfield.source;
    target.sceneId = heightfield.sceneId;
    target.size = heightfield.size;
    target.worldSize = heightfield.worldSize;
    target.peakHeight = heightfield.peakHeight;
}

function syncKilnImpostorState(target, sidecar) {
    const tileBlend = computeKilnDiagnosticTileBlend(sidecar, target.diagnosticViewDirection);
    target.tilesX = sidecar.tilesX;
    target.tilesY = sidecar.tilesY;
    target.tileSize = sidecar.tileSize;
    target.atlasSize = [sidecar.atlasWidth, sidecar.atlasHeight];
    target.worldSize = sidecar.worldSize;
    target.yOffset = sidecar.yOffset;
    target.colorLayer = sidecar.colorLayer;
    target.normalSpace = sidecar.normalSpace;
    target.auxLayers = sidecar.auxLayers;
    target.edgeBleedPx = sidecar.edgeBleedPx;
    target.tileBlendTiles = tileBlend.tiles;
    target.tileBlendWeights = tileBlend.weights;
}

export async function bootWebGpuDiagnostic() {
    const sceneBinding = resolveDiagnosticScene(window.location.search);
    const skyPreset = resolveDiagnosticSkyPreset(window.location.search, sceneBinding.skyPresetName);
    const skyFog = sceneBinding.active
        ? createSceneBoundSkyFogDiagnosticState({
            ...sceneBinding,
            skyPresetName: skyPreset.presetName,
        })
        : createSkyFogDiagnosticState({ presetName: skyPreset.presetName });
    const rockRim = createRockRimDiagnosticState(skyFog);
    const meadowQuad = createMeadowQuadDiagnosticState(skyFog);
    const animeWater = createAnimeWaterDiagnosticState(skyFog);
    const terrainHeightfield = createTerrainHeightfieldDiagnosticState(skyFog);
    const treeLeaf = createTreeLeafDiagnosticState();
    const grassBlade = createGrassBladeDiagnosticState(skyFog);
    const sheepWool = createSheepWoolDiagnosticState(skyFog);
    const kilnImpostor = createKilnImpostorDiagnosticState(skyFog);
    const state = window.__sdsG = {
        ...(window.__sdsG || {}),
        r: true,
        requested: true,
        ok: false,
        renderer: 'webgpu',
        islands: ['sun-billboard', 'portal-ring', 'meadow-quad', 'cloud-plane', 'sky-fog', 'rock-rim', 'tree-leaf', 'grass-blade', 'sheep-wool', 'kiln-impostor', 'anime-water', 'terrain-heightfield', 'glb-material-replacement', 'runtime-glb-material-proof', 'runtime-glb-rendered-clones', 'production-placement-preview', 'production-instanced-tree-preview', 'diagnostic-rock-instancing-preview', 'production-tree-rock-adapter', 'production-effect-adapter', 'production-atmosphere-adapter', 'production-water-adapter', 'production-terrain-adapter', 'production-grass-adapter', 'production-sheep-adapter'],
        sceneBinding,
        skyPreset,
        skyFog,
        rockRim,
        meadowQuad,
        animeWater,
        terrainHeightfield,
        treeLeaf,
        grassBlade,
        sheepWool,
        kilnImpostor,
        materialReplacement: null,
        runtimeGlbReplacement: null,
        runtimeGlbPreview: null,
        productionPlacementPreview: null,
        productionInstancingPreview: null,
        diagnosticRockPlacementPreview: null,
        diagnosticRockInstancingPreview: null,
        productionTreeRockAdapter: null,
        effectMaterialAdapter: null,
        productionEffectAdapter: null,
        productionAtmosphereAdapter: null,
        productionWaterAdapter: null,
        productionTerrainAdapter: null,
        productionGrassAdapter: null,
        productionSheepAdapter: null,
        factorySuite: null,
        frames: 0,
    };

    const container = document.getElementById('canvas-container') || document.body;
    container.replaceChildren();

    const status = document.createElement('div');
    status.style.cssText = 'position:fixed;left:16px;top:16px;z-index:50;padding:10px 12px;background:#111;color:#dff;font:12px system-ui,sans-serif;border:1px solid #355;';
    status.textContent = 'WebGPU diagnostic booting';
    document.body.appendChild(status);

    const fail = (message) => {
        state.ok = false;
        state.error = message;
        status.textContent = `WebGPU diagnostic failed: ${message}`;
        return state;
    };

    if (!navigator.gpu) return fail('navigator.gpu is unavailable');

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return fail('requestAdapter returned null');

    let proofDevice = null;
    try {
        proofDevice = await adapter.requestDevice();
    } catch (err) {
        return fail(`requestDevice failed: ${String(err?.message || err)}`);
    } finally {
        proofDevice?.destroy?.();
    }

    const {
        WebGPURenderer,
        Scene,
        PerspectiveCamera,
        BoxGeometry,
        PlaneGeometry,
        RingGeometry,
        SphereGeometry,
        CylinderGeometry,
        IcosahedronGeometry,
        Mesh,
        MeshBasicNodeMaterial,
        MeshLambertNodeMaterial,
        MeshStandardNodeMaterial,
        PointsNodeMaterial,
        LineBasicNodeMaterial,
        Color,
        Fog,
        AmbientLight,
        DirectionalLight,
        AdditiveBlending,
        BackSide,
        DoubleSide,
        Group,
        Box3,
        InstancedMesh,
        Matrix4,
        Object3D,
        Vector3,
        DataTexture,
        TextureLoader,
        RedFormat,
        FloatType,
        LinearFilter,
        NearestFilter,
        ClampToEdgeWrapping,
        SRGBColorSpace,
        NoColorSpace,
        TSL,
    } = await loadWebGpuThree();
    const webGpuModules = {
        MeshBasicNodeMaterial,
        MeshLambertNodeMaterial,
        MeshStandardNodeMaterial,
        PointsNodeMaterial,
        LineBasicNodeMaterial,
        AdditiveBlending,
        BackSide,
        DoubleSide,
        TSL,
    };
    const nodeMaterialFactories = createKonveyorNodeMaterialFactorySuite(webGpuModules, {
        skyFog,
        treeRock: {
            treeLeaf,
            rockRim,
        },
        grass: {
            meadowQuad,
            grassBlade,
        },
        water: {
            fogColor: skyFog.fogColor,
            sunColor: skyFog.sunColor,
        },
        terrain: {
            fogColor: skyFog.fogColor,
        },
    });
    state.factorySuite = summarizeKonveyorNodeMaterialFactorySuite(nodeMaterialFactories);
    const {
        atmosphere: atmosphereFactories,
        effects: effectFactories,
        treeRock: treeRockFactories,
        grass: grassFactories,
        water: waterFactories,
        terrain: terrainFactories,
        sheep: sheepFactories,
        impostor: impostorFactories,
    } = nodeMaterialFactories;

    const canvas = document.createElement('canvas');
    container.appendChild(canvas);

    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    await renderer.init();

    const scene = new Scene();
    const fogColor = new Color().setRGB(...skyFog.fogColor);
    scene.background = fogColor.clone();
    scene.fog = new Fog(fogColor, skyFog.fogNear, skyFog.fogFar);
    scene.add(new AmbientLight(0xffffff, 0.65));
    const keyLight = new DirectionalLight(0xffffff, 1.2);
    keyLight.position.set(1.5, 2.2, 3.0);
    scene.add(keyLight);

    const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 0.2, 3);
    const productionAtmosphereProof = createProductionAtmosphereAdapterDiagnosticProof({
        scene,
        camera,
        sceneBinding,
        skyFog,
        atmosphereFactories,
        webGpuModules,
    });
    state.productionAtmosphereAdapter = productionAtmosphereProof.proof;
    if (!state.productionAtmosphereAdapter.ok) {
        return fail('production atmosphere adapter proof failed');
    }

    const material = new MeshBasicNodeMaterial();
    material.colorNode = TSL.vec4(0.28, 0.78, 0.92, 1.0);

    const cube = new Mesh(new BoxGeometry(1, 1, 1), material);
    cube.position.x = 0.55;
    scene.add(cube);

    const rock = new Mesh(new IcosahedronGeometry(0.42, 2), new MeshStandardNodeMaterial());
    rock.position.set(1.45, 0.25, 0.05);
    rock.rotation.set(0.25, 0.45, 0.1);
    const rockReplacement = replaceRockMaterialsByTraversal(
        rock,
        treeRockFactories.createRockMaterial
    );
    scene.add(rock);

    const skyFogBackdrop = new Mesh(
        new PlaneGeometry(7.5, 4.25, 1, 1),
        atmosphereFactories.createSkyDomeMaterial().material
    );
    skyFogBackdrop.position.set(0, 0.05, -1.65);
    skyFogBackdrop.renderOrder = -10;
    scene.add(skyFogBackdrop);

    const sunMaterialResult = createKonveyorEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
        createDefaultMaterial: () => {
            const result = effectFactories.createSunBillboardMaterial();
            return result.material ?? result;
        },
        search: '?renderer=webgpu&konveyorEffects=1',
        factories: effectFactories,
    });
    const sun = new Mesh(new PlaneGeometry(1.45, 1.45), sunMaterialResult.material);
    sun.position.set(-0.85, 0.35, 0.15);
    scene.add(sun);

    const treeGroup = new Group();
    const treeBranchSource = new MeshStandardNodeMaterial();
    treeBranchSource.name = 'branches';
    const treeBranchMesh = new Mesh(new BoxGeometry(0.1, 0.78, 0.1), treeBranchSource);
    treeBranchMesh.position.set(0, -0.14, -0.01);
    treeGroup.add(treeBranchMesh);

    const treeLeafSource = new MeshStandardNodeMaterial();
    treeLeafSource.name = 'leaves';
    const treeLeafMesh = new Mesh(new PlaneGeometry(0.72, 1.05, 5, 8), treeLeafSource);
    treeLeafMesh.position.set(0, 0.26, 0.02);
    treeLeafMesh.rotation.set(0.0, -0.18, -0.25);
    treeGroup.add(treeLeafMesh);
    const treeReplacement = replaceTreeMaterialsByName(treeGroup, {
        branches: treeRockFactories.createTreeBranchMaterial,
        leaves: treeRockFactories.createTreeLeafMaterial,
    });
    treeGroup.position.set(-1.55, 0.33, 0.18);
    scene.add(treeGroup);
    state.materialReplacement = {
        rocks: rockReplacement,
        trees: treeReplacement,
    };
    try {
        state.runtimeGlbReplacement = await createRuntimeGlbMaterialReplacementProof();
        if (!state.runtimeGlbReplacement.summary?.ok) {
            return fail('runtime GLB material proof failed');
        }
    } catch (err) {
        state.runtimeGlbReplacement = {
            ok: false,
            error: String(err?.message || err),
        };
        return fail(`runtime GLB material proof failed: ${state.runtimeGlbReplacement.error}`);
    }
    try {
        state.runtimeGlbPreview = await createRuntimeGlbPreview({
            scene,
            three: { Box3, InstancedMesh, Matrix4, Object3D, Vector3 },
            ...treeRockFactories,
        });
        if (!state.runtimeGlbPreview.ok) {
            return fail('runtime GLB rendered clone proof failed');
        }
        state.productionPlacementPreview = state.runtimeGlbPreview.productionPlacementPreview;
        state.productionInstancingPreview = state.runtimeGlbPreview.productionInstancingPreview;
        state.diagnosticRockPlacementPreview = state.runtimeGlbPreview.diagnosticRockPlacementPreview;
        state.diagnosticRockInstancingPreview = state.runtimeGlbPreview.diagnosticRockInstancingPreview;
        const productionTreeRockProof = createProductionTreeRockAdapterDiagnosticProof({
            sceneBinding,
            runtimeGlbPreview: state.runtimeGlbPreview,
        });
        state.productionTreeRockAdapter = productionTreeRockProof.proof;
        if (!state.productionTreeRockAdapter.ok) {
            return fail('production tree/rock adapter proof failed');
        }
    } catch (err) {
        state.runtimeGlbPreview = {
            ok: false,
            error: String(err?.message || err),
        };
        return fail(`runtime GLB rendered clone proof failed: ${state.runtimeGlbPreview.error}`);
    }

    const portalMaterialResult = createKonveyorEffectMaterial('portal-ring', 'createPortalRingMaterial', {
        createDefaultMaterial: () => {
            const result = effectFactories.createPortalRingMaterial();
            return result.material ?? result;
        },
        search: '?renderer=webgpu&konveyorEffects=1',
        factories: effectFactories,
    });
    const portal = new Mesh(new RingGeometry(0.62, 0.86, 80, 1), portalMaterialResult.material);
    portal.position.set(-0.85, -0.75, 0.12);
    scene.add(portal);
    state.effectMaterialAdapter = {
        sun: sunMaterialResult.summary,
        portal: portalMaterialResult.summary,
    };
    const productionEffectProof = createProductionEffectAdapterDiagnosticProof({
        scene,
        camera,
        sceneBinding,
        skyFog,
        effectFactories,
    });
    state.productionEffectAdapter = productionEffectProof.proof;
    if (!state.productionEffectAdapter.ok) {
        return fail('production effect adapter proof failed');
    }

    const meadow = new Mesh(
        new PlaneGeometry(1.45, 0.8, 1, 1),
        grassFactories.createMeadowQuadMaterial(meadowQuad)
    );
    meadow.position.set(0.85, -0.75, 0.1);
    scene.add(meadow);

    const waterHeightTexture = await createDiagnosticHeightTexture({
        DataTexture,
        RedFormat,
        FloatType,
        NearestFilter,
        ClampToEdgeWrapping,
    });
    animeWater.heightfieldTexture = waterHeightTexture.userData.konveyorHeightfield;
    syncDiagnosticHeightfieldState(terrainHeightfield, waterHeightTexture.userData.konveyorHeightfield);
    const productionWaterProof = createProductionWaterAdapterDiagnosticProof({
        scene,
        sceneBinding,
        heightTexture: waterHeightTexture,
        waterFactories,
    });
    state.productionWaterAdapter = productionWaterProof.proof;
    if (!state.productionWaterAdapter.ok) {
        return fail('production water adapter proof failed');
    }
    const productionTerrainProof = createProductionTerrainAdapterDiagnosticProof({
        scene,
        sceneBinding,
        heightTexture: waterHeightTexture,
        terrainFactories,
    });
    state.productionTerrainAdapter = productionTerrainProof.proof;
    if (!state.productionTerrainAdapter.ok) {
        return fail('production terrain adapter proof failed');
    }
    const productionGrassProof = createProductionGrassAdapterDiagnosticProof({
        scene,
        sceneBinding,
        heightTexture: waterHeightTexture,
        grassFactories,
        three: { Mesh, PlaneGeometry },
    });
    state.productionGrassAdapter = productionGrassProof.proof;
    if (!state.productionGrassAdapter.ok) {
        return fail('production grass adapter proof failed');
    }
    const productionSheepProof = createProductionSheepAdapterDiagnosticProof({
        scene,
        sceneBinding,
        sheepFactories,
    });
    state.productionSheepAdapter = productionSheepProof.proof;
    if (!state.productionSheepAdapter.ok) {
        return fail('production sheep adapter proof failed');
    }
    const water = new Mesh(
        new PlaneGeometry(2.0, 0.62, 1, 1),
        waterFactories.createAnimeWaterMaterial({
            ...animeWater,
            heightTexture: waterHeightTexture,
        })
    );
    water.position.set(0.0, -1.16, 0.09);
    scene.add(water);

    const terrainPatch = new Mesh(
        new PlaneGeometry(2.15, 0.72, 1, 1),
        terrainFactories.createTerrainMaterial({
            ...terrainHeightfield,
            heightTexture: waterHeightTexture,
        })
    );
    terrainPatch.position.set(0.0, -0.34, 0.08);
    scene.add(terrainPatch);

    const grassBladeGeometry = new PlaneGeometry(0.58, grassBlade.bladeHeight, 4, 8);
    grassBladeGeometry.translate(0, grassBlade.bladeHeight * 0.5, 0);
    const grassBladeMesh = new Mesh(
        grassBladeGeometry,
        grassFactories.createGrassBladeMaterial(grassBlade)
    );
    grassBladeMesh.position.set(1.92, -0.82, 0.2);
    grassBladeMesh.rotation.set(0, -0.08, 0.06);
    scene.add(grassBladeMesh);

    const sheepGroup = new Group();
    const sheepWoolMaterial = sheepFactories.createSheepMaterial(sheepWool);
    const sheepFaceMaterial = sheepFactories.createSheepPartMaterial('konveyor-node-sheep-face', sheepWool.faceColor);
    const sheepHoofMaterial = sheepFactories.createSheepPartMaterial('konveyor-node-sheep-hoof', sheepWool.hoofColor);
    const sheepBody = new Mesh(new SphereGeometry(0.36, 18, 12), sheepWoolMaterial);
    sheepBody.scale.set(1.2, 0.82, 1.35);
    sheepBody.position.set(0, 0.22, 0);
    sheepGroup.add(sheepBody);
    const sheepHead = new Mesh(new SphereGeometry(0.18, 12, 8), sheepFaceMaterial);
    sheepHead.scale.set(0.9, 0.86, 1.05);
    sheepHead.position.set(0, 0.25, 0.44);
    sheepGroup.add(sheepHead);
    const legOffsets = [
        [-0.22, 0.18],
        [0.22, 0.18],
        [-0.22, -0.18],
        [0.22, -0.18],
    ];
    legOffsets.forEach(([x, z]) => {
        const leg = new Mesh(new CylinderGeometry(0.035, 0.045, 0.28, 6), sheepHoofMaterial);
        leg.position.set(x, -0.02, z);
        sheepGroup.add(leg);
    });
    sheepGroup.position.set(-1.95, -1.02, 0.32);
    sheepGroup.rotation.set(0, 0.16, 0);
    scene.add(sheepGroup);

    const kilnAssets = await createDiagnosticKilnImpostorAssets({
        TextureLoader,
        LinearFilter,
        ClampToEdgeWrapping,
        SRGBColorSpace,
        NoColorSpace,
    });
    syncKilnImpostorState(kilnImpostor, kilnAssets.sidecar);
    const kilnImpostorMesh = new Mesh(
        new PlaneGeometry(0.82, 0.82, 1, 1),
        impostorFactories.createKilnImpostorMaterial({
            ...kilnImpostor,
            albedoAtlas: kilnAssets.albedoAtlas,
            normalAtlas: kilnAssets.normalAtlas,
            depthAtlas: kilnAssets.depthAtlas,
        })
    );
    kilnImpostorMesh.position.set(-1.05, -1.16, 0.27);
    kilnImpostorMesh.rotation.set(0, 0.1, 0);
    scene.add(kilnImpostorMesh);

    const cloudPlane = new Mesh(
        new PlaneGeometry(2.4, 0.65, 1, 1),
        atmosphereFactories.createCloudLayerMaterial().material
    );
    cloudPlane.position.set(0.15, 1.05, 0.05);
    scene.add(cloudPlane);

    const resize = () => {
        const w = Math.max(1, window.innerWidth);
        const h = Math.max(1, window.innerHeight);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
    };
    window.addEventListener('resize', resize);
    resize();

    let running = true;
    const render = async (t) => {
        if (!running) return;
        cube.rotation.x = t * 0.0006;
        cube.rotation.y = t * 0.0009;
        rock.rotation.y = 0.45 + t * 0.00035;
        treeGroup.rotation.z = Math.sin(t * 0.0012) * 0.035;
        await renderer.renderAsync(scene, camera);
        state.frames += 1;
        if (state.frames === 1) {
            state.ok = true;
            status.textContent = 'WebGPU diagnostic rendering';
        }
        requestAnimationFrame(render);
    };

    state.dispose = () => {
        running = false;
        window.removeEventListener('resize', resize);
        cube.geometry.dispose();
        material.dispose();
        rock.geometry.dispose();
        rock.material.dispose();
        skyFogBackdrop.geometry.dispose();
        skyFogBackdrop.material.dispose();
        portal.geometry.dispose();
        portal.material.dispose();
        meadow.geometry.dispose();
        meadow.material.dispose();
        water.geometry.dispose();
        water.material.dispose();
        terrainPatch.geometry.dispose();
        terrainPatch.material.dispose();
        grassBladeMesh.geometry.dispose();
        grassBladeMesh.material.dispose();
        sheepGroup.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry?.dispose();
        });
        sheepWoolMaterial.dispose();
        sheepFaceMaterial.dispose();
        sheepHoofMaterial.dispose();
        kilnImpostorMesh.geometry.dispose();
        kilnImpostorMesh.material.dispose();
        kilnAssets.albedoAtlas.dispose();
        kilnAssets.normalAtlas.dispose();
        kilnAssets.depthAtlas.dispose();
        waterHeightTexture.dispose();
        cloudPlane.geometry.dispose();
        cloudPlane.material.dispose();
        productionAtmosphereProof.atmosphere.dispose();
        productionEffectProof.dispose();
        productionWaterProof.water.dispose();
        productionTerrainProof.builder.dispose();
        productionGrassProof.dispose();
        productionSheepProof.sheep.dispose();
        renderer.dispose();
        sun.geometry.dispose();
        sun.material.dispose();
        treeGroup.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry?.dispose();
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach((m) => m?.dispose?.());
        });
        state.runtimeGlbPreview?.dispose?.();
        canvas.remove();
        status.remove();
    };

    requestAnimationFrame(render);
    return state;
}

export { bootWebGpuDiagnostic as boot };
