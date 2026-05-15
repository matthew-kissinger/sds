import {
    replaceRockMaterialsByTraversal,
    replaceTreeMaterialsByName,
} from './webgpuMaterialReplacement.js';
import {
    DEFAULT_SKY_FOG_SAMPLE_PRESET,
    createSkyFogSamplePacket,
} from '../atmosphere/skyFogSamplePacket.js';
import { isKnownPreset } from '../atmosphere/skyPresets.js';
import { DEFAULT_SCENE_ID, getSceneById } from '../../shared/scenes/index.js';
import { createRuntimeGlbMaterialReplacementProof } from './webgpuGlbMaterialProof.js';
import { createRuntimeGlbPreview } from './webgpuRuntimeGlbPreview.js';
import {
    createKonveyorEffectMaterial,
} from '../effects/konveyorEffectMaterialAdapter.js';
import { createKonveyorSkyFogNodeMaterial } from '../atmosphere/konveyorSkyNodeMaterial.js';
import { createKonveyorCloudLayerNodeMaterial } from '../atmosphere/konveyorCloudNodeMaterial.js';
import { createKonveyorGrassBladeNodeMaterial } from '../world/konveyorGrassBladeNodeMaterial.js';
import { createKonveyorMeadowQuadNodeMaterial } from '../world/konveyorMeadowQuadNodeMaterial.js';
import { createKonveyorTerrainHeightfieldNodeMaterial } from '../world/konveyorTerrainNodeMaterial.js';
import { createKonveyorAnimeWaterNodeMaterial } from '../water/konveyorAnimeWaterNodeMaterial.js';

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

function createSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, TSL }) {
    const { float, length, pow, smoothstep, uv, vec2, vec3 } = TSL;
    const d = uv().sub(vec2(0.5, 0.5));
    const r = length(d).mul(2.0);
    const core = float(1.0).sub(smoothstep(0.12, 0.22, r));
    const haloFalloff = float(1.0).sub(smoothstep(0.0, 1.0, r));
    const halo = pow(haloFalloff, 2.5).mul(0.45);
    const intensity = float(1.1);
    const rgb = vec3(1.0, 0.97, 0.88).mul(core)
        .add(vec3(1.0, 0.82, 0.55).mul(halo))
        .mul(intensity);
    const alpha = core.add(halo.mul(0.7)).mul(intensity).mul(haloFalloff);

    const material = new MeshBasicNodeMaterial();
    material.name = 'konveyor-node-sun-billboard';
    material.colorNode = rgb;
    material.opacityNode = alpha;
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.blending = AdditiveBlending;
    return material;
}

function createPortalRingNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL }) {
    const { abs, float, mix, sin, smoothstep, time, uv, vec3 } = TSL;
    const ringUv = uv();
    const radial = ringUv.y;
    const phase = ringUv.x.mul(6.2831853).add(time.mul(0.9));
    const innerColor = vec3(0.424, 0.949, 1.0);
    const outerColor = vec3(0.608, 0.424, 1.0);
    const base = float(0.55).add(sin(phase).mul(0.35));
    const pulseGlow = float(0.35).mul(float(1.0).sub(smoothstep(0.0, 1.0, abs(radial.sub(0.5)).mul(2.0))));
    const intensity = base.add(pulseGlow.mul(0.9)).mul(0.85);
    const edge = smoothstep(0.0, 0.18, radial)
        .mul(float(1.0).sub(smoothstep(0.82, 1.0, radial)));

    const material = new MeshBasicNodeMaterial();
    material.name = 'konveyor-node-portal-ring';
    material.colorNode = mix(innerColor, outerColor, radial).mul(intensity);
    material.opacityNode = intensity.mul(edge);
    material.transparent = true;
    material.depthWrite = false;
    material.depthTest = true;
    material.side = DoubleSide;
    material.blending = AdditiveBlending;
    return material;
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

function createKilnImpostorNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL }, kilnImpostor, albedoAtlas, normalAtlas, depthAtlas) {
    const { clamp, dot, float, length, max, mix, normalize, smoothstep, texture, uv, positionView, vec2, vec3, vec4 } = TSL;
    const tileScaleX = 1 / kilnImpostor.tilesX;
    const tileScaleY = 1 / kilnImpostor.tilesY;
    const tileScale = vec2(tileScaleX, tileScaleY);
    const tileInset = vec2(
        0.5 / kilnImpostor.atlasSize[0] / tileScaleX,
        0.5 / kilnImpostor.atlasSize[1] / tileScaleY
    );
    const tileLocalUv = clamp(uv(), tileInset, vec2(1.0, 1.0).sub(tileInset));
    const tileUv = ([azIdx, elIdx]) => tileLocalUv.mul(tileScale)
        .add(vec2(azIdx / kilnImpostor.tilesX, (kilnImpostor.tilesY - 1 - elIdx) / kilnImpostor.tilesY));
    const [tile0, tile1, tile2] = kilnImpostor.tileBlendTiles;
    const [w0, w1, w2] = kilnImpostor.tileBlendWeights;
    const albedo0 = texture(albedoAtlas, tileUv(tile0));
    const albedo1 = texture(albedoAtlas, tileUv(tile1));
    const albedo2 = texture(albedoAtlas, tileUv(tile2));
    const alphaBlend = albedo0.a.mul(w0).add(albedo1.a.mul(w1)).add(albedo2.a.mul(w2));
    const albedoPremul = albedo0.rgb.mul(albedo0.a).mul(w0)
        .add(albedo1.rgb.mul(albedo1.a).mul(w1))
        .add(albedo2.rgb.mul(albedo2.a).mul(w2));
    const atlasRgb = albedoPremul.div(max(alphaBlend, 0.0001));
    const normal0 = texture(normalAtlas, tileUv(tile0)).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
    const normal1 = texture(normalAtlas, tileUv(tile1)).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
    const normal2 = texture(normalAtlas, tileUv(tile2)).rgb.mul(2.0).sub(vec3(1.0, 1.0, 1.0));
    const depthUnpack = vec4(
        255 / 256 / (256 * 256 * 256),
        255 / 256 / (256 * 256),
        255 / 256 / 256,
        255 / 256
    );
    const depth0 = dot(texture(depthAtlas, tileUv(tile0)).rgba, depthUnpack);
    const depth1 = dot(texture(depthAtlas, tileUv(tile1)).rgba, depthUnpack);
    const depth2 = dot(texture(depthAtlas, tileUv(tile2)).rgba, depthUnpack);
    const depthBlend = depth0.mul(w0).add(depth1.mul(w1)).add(depth2.mul(w2));
    const depthShade = mix(float(0.98), float(1.02), smoothstep(0.05, 0.95, depthBlend));
    const relightNormal = normalize(normal0.mul(w0).add(normal1.mul(w1)).add(normal2.mul(w2)));
    const sunDirection = normalize(vec3(...kilnImpostor.sunDirection));
    const wrappedSun = max(dot(relightNormal, sunDirection), 0.0).mul(0.65).add(0.35);
    const relitColor = atlasRgb.mul(
        vec3(...kilnImpostor.ambientColor).add(vec3(...kilnImpostor.sunColor).mul(wrappedSun.mul(0.42)))
    );
    const viewDistance = length(positionView);
    const fogBlend = smoothstep(kilnImpostor.fogNear, kilnImpostor.fogFar, viewDistance).mul(0.62);

    const material = new MeshBasicNodeMaterial();
    material.name = 'konveyor-node-kiln-impostor';
    material.colorNode = mix(relitColor.mul(depthShade), vec3(...kilnImpostor.fogColor), fogBlend);
    material.opacityNode = alphaBlend;
    material.transparent = true;
    material.depthWrite = true;
    material.depthTest = true;
    material.side = DoubleSide;
    material.alphaHash = true;
    material.alphaTest = kilnImpostor.alphaTest;
    return material;
}

function createSheepWoolNodeMaterial({ MeshStandardNodeMaterial, TSL }, sheepWool) {
    const { abs, dot, float, floor, fract, length, max, mix, normalize, normalView, positionLocal, positionView, positionWorld, pow, sin, smoothstep, time, vec3 } = TSL;
    const hash31 = (p) => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453));
    const noisePos = positionWorld.mul(sheepWool.woolNoiseScale)
        .add(vec3(time.mul(0.2), time.mul(0.12), time.mul(0.08)));
    const woolNoise = hash31(floor(noisePos)).mul(0.5)
        .add(hash31(floor(noisePos.mul(2.2))).mul(0.3))
        .add(hash31(floor(noisePos.mul(4.1))).mul(0.2));
    const normal = normalize(normalView);
    const viewDir = normalize(positionView.negate());
    const lightDir = normalize(vec3(...sheepWool.lightDirection));
    const nDotL = dot(normal, lightDir);
    const toon = floor(smoothstep(-0.15, 0.15, nDotL).mul(0.55).add(0.45).mul(5.0)).div(5.0);
    const woolColor = vec3(...sheepWool.bodyColor)
        .sub(vec3(0.03, 0.03, 0.03).mul(float(1.0).sub(woolNoise)))
        .add(vec3(0.02, 0.02, 0.02).mul(woolNoise));
    const colorShift = mix(vec3(0.96, 0.97, 1.0), vec3(1.02, 1.02, 1.0), toon);
    const fresnel = pow(float(1.0).sub(abs(dot(viewDir, normal))), 2.8);
    const sss = pow(max(dot(lightDir.negate(), viewDir), 0.0), 3.0).mul(0.12);
    const edge = float(1.0).sub(pow(abs(dot(viewDir, normal)), 0.7));
    const viewDistance = length(positionView);
    const fogBlend = smoothstep(sheepWool.fogNear, sheepWool.fogFar, viewDistance).mul(0.65);
    const woolDisplacement = woolNoise.mul(sheepWool.woolDisplacementStrength)
        .add(sin(time.mul(1.8)).mul(sheepWool.breathingStrength));
    const shaded = woolColor.mul(toon).mul(colorShift)
        .add(vec3(...sheepWool.rimColor).mul(fresnel.mul(0.35)))
        .add(vec3(...sheepWool.sssColor).mul(sss))
        .mul(float(1.0).sub(edge.mul(0.2)))
        .sub(vec3(0.03, 0.03, 0.03).mul(woolNoise.mul(1.5)));

    const material = new MeshStandardNodeMaterial();
    material.name = 'konveyor-node-sheep-wool';
    material.colorNode = mix(shaded, vec3(...sheepWool.fogColor), fogBlend);
    material.positionNode = positionLocal.add(normalize(positionLocal).mul(woolDisplacement));
    material.roughnessNode = float(0.98);
    material.metalnessNode = float(0.0);
    return material;
}

function createSheepPartNodeMaterial({ MeshStandardNodeMaterial, TSL }, name, color) {
    const { float, vec3 } = TSL;
    const material = new MeshStandardNodeMaterial();
    material.name = name;
    material.colorNode = vec3(...color);
    material.roughnessNode = float(0.92);
    material.metalnessNode = float(0.0);
    return material;
}

function createTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf) {
    const { abs, clamp, dot, float, floor, fract, length, mix, normalize, positionLocal, positionWorld, screenCoordinate, sin, smoothstep, time, uv, vec2, vec3 } = TSL;
    const leafUv = uv();
    const windDir = normalize(vec2(...treeLeaf.windDirection));
    const windPerp = vec2(-treeLeaf.windDirection[1], treeLeaf.windDirection[0]);
    const treeRange = Math.max(treeLeaf.treeTopY - treeLeaf.treeBaseY, 0.001);
    const posY01 = clamp(positionLocal.y.sub(treeLeaf.treeBaseY).div(treeRange), 0.0, 1.0);
    const windWeightBase = smoothstep(0.25, 1.0, posY01);
    const windWeight = windWeightBase.mul(windWeightBase);
    const worldX = positionWorld.x;
    const worldZ = positionWorld.z;
    const gustA = sin(worldX.mul(0.04).add(worldZ.mul(0.034)).sub(time.mul(0.84)));
    const gustB = sin(worldX.mul(0.018).add(worldZ.mul(0.022)).add(1.4).sub(time.mul(0.62)));
    const gustEnv = smoothstep(-0.2, 1.0, gustA.mul(0.6).add(gustB.mul(0.4)));
    const sway1 = sin(worldX.mul(0.15).add(worldZ.mul(0.11)).add(time.mul(0.85)));
    const sway2 = sin(worldX.mul(0.07).sub(worldZ.mul(0.13)).add(time.mul(0.55)));
    const sway = sway1.mul(0.6).add(sway2.mul(0.4));
    const carrier = sway.mul(float(0.4).add(gustEnv.mul(0.8)));
    const flutter = sin(worldX.mul(0.6).add(worldZ.mul(0.5)).add(time.mul(4.5)));
    const windDisp = windDir.mul(carrier.mul(treeLeaf.windStrength * 0.18).mul(windWeight))
        .add(windPerp.mul(flutter.mul(0.05 * treeLeaf.windStrength).mul(windWeight)));
    const leafCenter = leafUv.sub(vec2(0.5, 0.52));
    const leafRadius = length(vec2(leafCenter.x.mul(1.28), leafCenter.y.mul(0.82)));
    const leafShape = float(1.0).sub(smoothstep(0.42, 0.56, leafRadius));
    const midrib = float(1.0).sub(smoothstep(0.25, 0.85, abs(leafUv.x.sub(0.5)).mul(2.0)));
    const screenHash = fract(sin(dot(floor(screenCoordinate), vec2(17.0, 131.0))).mul(43758.5453));
    const occluderFade = float(1.0)
        .sub(smoothstep(0.16, 0.36, length(leafUv.sub(vec2(...treeLeaf.occluderUv)))))
        .mul(treeLeaf.occluderStrength);
    const alpha = leafShape
        .mul(float(1.0).sub(occluderFade.mul(treeLeaf.occluderPeak).mul(mix(0.65, 1.0, screenHash))));

    const material = new MeshStandardNodeMaterial();
    material.name = 'konveyor-node-leaves';
    material.colorNode = mix(vec3(...treeLeaf.baseColor), vec3(...treeLeaf.tipColor), posY01)
        .mul(mix(0.72, 1.14, midrib));
    material.opacityNode = alpha;
    material.positionNode = positionLocal.add(vec3(windDisp.x, 0.0, windDisp.y));
    material.roughnessNode = float(0.92);
    material.metalnessNode = float(0.0);
    material.alphaHash = treeLeaf.alphaHash;
    material.alphaTest = treeLeaf.alphaTest;
    material.side = DoubleSide;
    return material;
}

function createRockRimNodeMaterial({ MeshStandardNodeMaterial, TSL }, rockRim) {
    const { dot, float, max, normalize, normalView, positionView, pow, vec3 } = TSL;
    const viewDir = normalize(positionView.negate());
    const ndv = max(dot(viewDir, normalView), 0.0);
    const rim = pow(float(1.0).sub(ndv), rockRim.rimPower).mul(rockRim.rimStrength);

    const material = new MeshStandardNodeMaterial();
    material.name = 'konveyor-node-rock-rim';
    material.colorNode = vec3(...rockRim.baseColor);
    material.emissiveNode = vec3(...rockRim.rimColor).mul(rim);
    material.roughnessNode = float(0.86);
    material.metalnessNode = float(0.0);
    return material;
}

function createTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }) {
    const { float, vec3 } = TSL;
    const material = new MeshStandardNodeMaterial();
    material.name = 'konveyor-node-branches';
    material.colorNode = vec3(0.20, 0.11, 0.055);
    material.roughnessNode = float(0.94);
    material.metalnessNode = float(0.0);
    return material;
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
        islands: ['sun-billboard', 'portal-ring', 'meadow-quad', 'cloud-plane', 'sky-fog', 'rock-rim', 'tree-leaf', 'grass-blade', 'sheep-wool', 'kiln-impostor', 'anime-water', 'terrain-heightfield', 'glb-material-replacement', 'runtime-glb-material-proof', 'runtime-glb-rendered-clones', 'production-placement-preview', 'production-instanced-tree-preview', 'diagnostic-rock-instancing-preview', 'production-effect-adapter'],
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
        effectMaterialAdapter: null,
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
        Color,
        Fog,
        AmbientLight,
        DirectionalLight,
        AdditiveBlending,
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
        () => createRockRimNodeMaterial({ MeshStandardNodeMaterial, TSL }, rockRim)
    );
    scene.add(rock);

    const skyFogBackdrop = new Mesh(
        new PlaneGeometry(7.5, 4.25, 1, 1),
        createKonveyorSkyFogNodeMaterial({ MeshBasicNodeMaterial, TSL }, skyFog)
    );
    skyFogBackdrop.position.set(0, 0.05, -1.65);
    skyFogBackdrop.renderOrder = -10;
    scene.add(skyFogBackdrop);

    const sunMaterialResult = createKonveyorEffectMaterial('sun-billboard', 'createSunBillboardMaterial', {
        createDefaultMaterial: () => createSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, TSL }),
        search: '?renderer=webgpu&konveyorEffects=1',
        factories: {
            createSunBillboardMaterial: () => createSunBillboardNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, TSL }),
        },
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
        branches: () => createTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }),
        leaves: () => createTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf),
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
            createTreeBranchMaterial: () => createTreeBranchNodeMaterial({ MeshStandardNodeMaterial, TSL }),
            createTreeLeafMaterial: () => createTreeLeafNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, treeLeaf),
            createRockMaterial: () => createRockRimNodeMaterial({ MeshStandardNodeMaterial, TSL }, rockRim),
        });
        if (!state.runtimeGlbPreview.ok) {
            return fail('runtime GLB rendered clone proof failed');
        }
        state.productionPlacementPreview = state.runtimeGlbPreview.productionPlacementPreview;
        state.productionInstancingPreview = state.runtimeGlbPreview.productionInstancingPreview;
        state.diagnosticRockPlacementPreview = state.runtimeGlbPreview.diagnosticRockPlacementPreview;
        state.diagnosticRockInstancingPreview = state.runtimeGlbPreview.diagnosticRockInstancingPreview;
    } catch (err) {
        state.runtimeGlbPreview = {
            ok: false,
            error: String(err?.message || err),
        };
        return fail(`runtime GLB rendered clone proof failed: ${state.runtimeGlbPreview.error}`);
    }

    const portalMaterialResult = createKonveyorEffectMaterial('portal-ring', 'createPortalRingMaterial', {
        createDefaultMaterial: () => createPortalRingNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL }),
        search: '?renderer=webgpu&konveyorEffects=1',
        factories: {
            createPortalRingMaterial: () => createPortalRingNodeMaterial({ MeshBasicNodeMaterial, AdditiveBlending, DoubleSide, TSL }),
        },
    });
    const portal = new Mesh(new RingGeometry(0.62, 0.86, 80, 1), portalMaterialResult.material);
    portal.position.set(-0.85, -0.75, 0.12);
    scene.add(portal);
    state.effectMaterialAdapter = {
        sun: sunMaterialResult.summary,
        portal: portalMaterialResult.summary,
    };

    const meadow = new Mesh(
        new PlaneGeometry(1.45, 0.8, 1, 1),
        createKonveyorMeadowQuadNodeMaterial({ MeshLambertNodeMaterial, DoubleSide, TSL }, meadowQuad)
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
    const water = new Mesh(
        new PlaneGeometry(2.0, 0.62, 1, 1),
        createKonveyorAnimeWaterNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL }, animeWater, waterHeightTexture)
    );
    water.position.set(0.0, -1.16, 0.09);
    scene.add(water);

    const terrainPatch = new Mesh(
        new PlaneGeometry(2.15, 0.72, 1, 1),
        createKonveyorTerrainHeightfieldNodeMaterial({ MeshLambertNodeMaterial, DoubleSide, TSL }, terrainHeightfield, waterHeightTexture)
    );
    terrainPatch.position.set(0.0, -0.34, 0.08);
    scene.add(terrainPatch);

    const grassBladeGeometry = new PlaneGeometry(0.58, grassBlade.bladeHeight, 4, 8);
    grassBladeGeometry.translate(0, grassBlade.bladeHeight * 0.5, 0);
    const grassBladeMesh = new Mesh(
        grassBladeGeometry,
        createKonveyorGrassBladeNodeMaterial({ MeshStandardNodeMaterial, DoubleSide, TSL }, grassBlade)
    );
    grassBladeMesh.position.set(1.92, -0.82, 0.2);
    grassBladeMesh.rotation.set(0, -0.08, 0.06);
    scene.add(grassBladeMesh);

    const sheepGroup = new Group();
    const sheepWoolMaterial = createSheepWoolNodeMaterial({ MeshStandardNodeMaterial, TSL }, sheepWool);
    const sheepFaceMaterial = createSheepPartNodeMaterial({ MeshStandardNodeMaterial, TSL }, 'konveyor-node-sheep-face', sheepWool.faceColor);
    const sheepHoofMaterial = createSheepPartNodeMaterial({ MeshStandardNodeMaterial, TSL }, 'konveyor-node-sheep-hoof', sheepWool.hoofColor);
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
        createKilnImpostorNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL }, kilnImpostor, kilnAssets.albedoAtlas, kilnAssets.normalAtlas, kilnAssets.depthAtlas)
    );
    kilnImpostorMesh.position.set(-1.05, -1.16, 0.27);
    kilnImpostorMesh.rotation.set(0, 0.1, 0);
    scene.add(kilnImpostorMesh);

    const cloudPlane = new Mesh(
        new PlaneGeometry(2.4, 0.65, 1, 1),
        createKonveyorCloudLayerNodeMaterial({ MeshBasicNodeMaterial, DoubleSide, TSL })
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
